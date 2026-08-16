import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { classifyFinancialRow } from "@/lib/finance/imports/financialRules";
import { ofxParser } from "@/lib/finance/imports/ofxParser";
import { nubankPdfParser } from "@/lib/finance/imports/nubankPdfParser";
import { reconcileDocument } from "@/lib/finance/imports/reconciliation";
import type { NormalizedTransaction } from "@/lib/finance/imports/types";
import { buildVisionDocument } from "@/lib/finance/imports/vision";
import { spreadsheetBufferToCsv } from "@/lib/finance/imports/xlsx";

const row = (patch: Partial<NormalizedTransaction>): NormalizedTransaction => ({
  institution: "UNKNOWN",
  sourceType: "BANK_ACCOUNT",
  transactionDate: "2026-08-01",
  descriptionOriginal: "Compra",
  descriptionNormalized: "COMPRA",
  amount: "10.00",
  direction: "DEBIT",
  currency: "BRL",
  confidence: 0.9,
  fingerprint: "fp",
  metadata: {},
  ...patch,
});

describe("financial import pipeline", () => {
  it.each([
    ["Rendimento da conta", "CREDIT", "income", "yield", false],
    ["Aplicação automática CDB", "DEBIT", "transfer", "investment_in", false],
    ["Resgate CDB", "CREDIT", "transfer", "investment_out", true],
    ["Pagamento de fatura", "DEBIT", "transfer", "bill_payment", false],
    ["Tarifa bancária", "DEBIT", "expense", "fee", false],
    ["Pix enviado para Fulano", "DEBIT", "expense", "transfer", true],
  ] as const)("classifies %s safely", (description, direction, type, role, needsReview) => {
    expect(classifyFinancialRow(row({ descriptionOriginal: description, direction }))).toMatchObject({
      type,
      role,
      needsReview,
    });
  });

  it("parses OFX SGML without closing STMTTRN tags and scopes FITID to the account", async () => {
    const text = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>260<ACCTID>12345
<BANKTRANLIST><DTSTART>20260801000000<DTEND>20260831235959
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260815120000<TRNAMT>-12.34<FITID>abc<NAME>PADARIA
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260816120000<TRNAMT>0.55<FITID>def<MEMO>RENDIMENTO
</BANKTRANLIST><LEDGERBAL><BALAMT>100.00</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const parsed = await ofxParser.parse({ fileName: "conta.ofx", fileText: text });
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]).toMatchObject({ amount: "12.34", direction: "DEBIT", sourceAccountId: "260:12345" });
    expect(parsed.transactions[0].externalId).toBe("UNKNOWN:260:12345:abc");
    expect(parsed.period).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(parsed.totals?.finalBalance).toBe("100.00");
  });

  it("parses OFX XML credit-card blocks", async () => {
    const text = `<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>9999</ACCTID></CCACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260810</DTPOSTED><TRNAMT>-45.90</TRNAMT><FITID>x1</FITID><NAME>UBER</NAME></STMTTRN></BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const parsed = await ofxParser.parse({ fileName: "cartao.ofx", fileText: text });
    expect(parsed.detection.documentType).toBe("CREDIT_CARD_STATEMENT");
    expect(parsed.transactions[0]).toMatchObject({ sourceType: "CREDIT_CARD", transactionDate: "2026-08-10", amount: "45.90" });
  });

  it("preserves Nubank purchase, due date, statement month and bill payment", async () => {
    const text = `Nubank\nFatura do cartão\nVencimento: 05/09/2026\nTotal da fatura R$ 80,00\n12 AGO LOJA EXEMPLO 100,00\n15 AGO PAGAMENTO RECEBIDO -20,00`;
    const parsed = await nubankPdfParser.parse({ fileName: "nubank.pdf", mimeType: "application/pdf", fileText: text });
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]).toMatchObject({ transactionDate: "2026-08-12", dueDate: "2026-09-05", statementMonth: "2026-09" });
    expect(parsed.transactions[1]).toMatchObject({ direction: "CREDIT", descriptionOriginal: "PAGAMENTO RECEBIDO" });
    expect(parsed.totals?.statementTotal).toBe("80.00");
  });

  it("converts the populated XLSX sheet to reusable CSV", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Data", "Descrição", "Valor"], ["2026-08-10", "Mercado", -32.5]]), "Extrato");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const csv = spreadsheetBufferToCsv(buffer);
    expect(csv).toContain("Data,Descrição,Valor");
    expect(csv).toContain("2026-08-10,Mercado,-32.5");
  });

  it("reconciles printed card total after refunds and ignores bill payment", () => {
    const report = reconcileDocument([
      row({ sourceType: "CREDIT_CARD", descriptionOriginal: "Loja", amount: "100.00" }),
      row({ sourceType: "CREDIT_CARD", descriptionOriginal: "Estorno Loja", direction: "CREDIT", amount: "20.00", fingerprint: "2" }),
      row({ sourceType: "CREDIT_CARD", descriptionOriginal: "Pagamento recebido", direction: "CREDIT", amount: "80.00", fingerprint: "3" }),
    ], { statementTotal: 80 });
    expect(report.ok).toBe(true);
    expect(report.lines[0].found).toBe(80);
  });

  it("normalizes vision dates, preserves statement month and flags repeated lines for review", async () => {
    const document = await buildVisionDocument([{
      institution: "NUBANK",
      document_type: "CREDIT_CARD_STATEMENT",
      due_date: "2026-09-05",
      statement_month: "2026-09",
      transactions: [
        { description_original: "Compra exemplo", amount: 15, direction: "DEBIT", transaction_date: "2026-08-12", page_number: 1, confidence: 0.95 },
        { description_original: "Compra exemplo", amount: 15, direction: "DEBIT", transaction_date: "2026-08-12", page_number: 2, confidence: 0.95 },
      ],
    }], { fileName: "fatura.pdf", fileHash: "hash", format: "PDF_IMAGE" });
    expect(document.transactions).toHaveLength(2);
    expect(document.transactions[0]).toMatchObject({
      transactionDate: "2026-08-12",
      dueDate: "2026-09-05",
      statementMonth: "2026-09",
      competenceMonth: "2026-08",
      pageNumber: 1,
    });
    expect(document.transactions[1]).toMatchObject({ possibleDuplicate: true, needsReview: true, pageNumber: 2 });
  });
});
