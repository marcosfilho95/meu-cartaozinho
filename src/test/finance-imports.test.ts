import { describe, expect, it } from "vitest";
import { mercadoPagoTextParser, parseMercadoPagoTextRows } from "@/lib/finance/imports/mercadoPagoTextParser";
import { genericCsvParser } from "@/lib/finance/imports/genericCsvParser";
import { genericTextParser } from "@/lib/finance/imports/genericTextParser";
import { classifyFinancialRow } from "@/lib/finance/imports/financialRules";
import {
  normalizeImportedAccountName,
  resolveImportedAccountId,
} from "@/lib/finance/imports/accountNormalization";
import { parseNubankCsvRows } from "@/lib/finance/imports/nubankCsvParser";
import { addMonthsToIsoDate, markDuplicates, suggestCategoryName } from "@/lib/finance/imports/utils";

describe("financial imports", () => {
  it("marks repeated rows inside the same imported document as duplicates", async () => {
    const parsed = await genericCsvParser.parse({
      fileName: "extrato.csv",
      mimeType: "text/csv",
      fileText: "Data;Conta;Descricao;Valor\n12/05/2026;Mercado Pago;PIX RECEBIDO;29,90\n12/05/2026;Mercado Pago;PIX RECEBIDO;29,90",
      fileHash: "same-document-duplicates",
    });

    const marked = markDuplicates(parsed.transactions, []);
    expect(marked.map((row) => row.possibleDuplicate)).toEqual([false, true]);
  });

  it("parses pasted C6 card CSV with introductory lines and semicolon columns", async () => {
    const text = `FATURA C6 2026-06-05

Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)
04/05/2026;MARCOS A FELIX O F;0644;-;Pagamento Fatura QR CODE;Única;0;0;-264,48
24/05/2026;MARCOS A FELIX O F;0644;-;Anuidade Diferenciada;Única;0;0;98,00
22/12/2025;MARCOS A FELIX O F;8419;Educacional;HIM*SOBRAL EDITORA LTD;12/12;0;0;97,14`;
    const context = {
      fileName: "extrato-colado.txt",
      mimeType: "text/plain",
      fileText: text,
      fileHash: "c6-pasted-test",
    };

    const detection = await genericCsvParser.canHandle(context);
    const parsed = await genericCsvParser.parse(context);

    expect(detection).toMatchObject({
      institution: "C6",
      documentType: "CREDIT_CARD_STATEMENT",
      format: "CSV",
    });
    expect(detection.confidence).toBeCloseTo(0.8);
    expect(parsed.metadata).toMatchObject({ delimiter: ";", headerLine: 2 });
    expect(parsed.transactions).toHaveLength(3);
    expect(parsed.transactions[0]).toMatchObject({
      descriptionOriginal: "Pagamento Fatura QR CODE",
      amount: "264.48",
      direction: "CREDIT",
      sourceType: "CREDIT_CARD",
      possibleInternalTransfer: true,
    });
    expect(parsed.transactions[1]).toMatchObject({
      descriptionOriginal: "Anuidade Diferenciada",
      amount: "98.00",
      direction: "DEBIT",
      categorySuggestion: "Taxas Bancarias",
    });
    expect(parsed.transactions[2]).toMatchObject({
      descriptionOriginal: "HIM*SOBRAL EDITORA LTD",
      amount: "97.14",
      direction: "DEBIT",
      installmentCurrent: 12,
      installmentTotal: 12,
      categorySuggestion: "Educacao",
      sourceAccountId: "8419",
    });
  });

  it("treats a positive MM-DD card purchase as an expense", async () => {
    const parsed = await genericCsvParser.parse({
      fileName: "fatura-cartao.txt",
      mimeType: "text/plain",
      fileText: "FATURA DO CARTAO\n05-12 | AMAZON BR | 29,90",
      fileHash: "positive-card-purchase",
      statementMonth: "2026-06",
    });

    expect(parsed.detection.documentType).toBe("CREDIT_CARD_STATEMENT");
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0]).toMatchObject({
      transactionDate: "2026-05-12",
      descriptionOriginal: "AMAZON BR",
      amount: "29.90",
      direction: "DEBIT",
      sourceType: "CREDIT_CARD",
    });
    expect(classifyFinancialRow(parsed.transactions[0]).type).toBe("expense");
  });

  it("applies the same positive-purchase rule to pasted invoice text", async () => {
    const parsed = await genericTextParser.parse({
      fileName: "fatura.txt",
      mimeType: "text/plain",
      fileText: "FATURA DO CARTAO\n05-12 AMAZON BR 29,90",
      fileHash: "positive-card-text",
      statementMonth: "2026-06",
    });

    expect(parsed.transactions[0]).toMatchObject({
      transactionDate: "2026-05-12",
      amount: "29.90",
      direction: "DEBIT",
      sourceType: "CREDIT_CARD",
    });
  });

  it("keeps a positive bank-statement value as income", async () => {
    const parsed = await genericCsvParser.parse({
      fileName: "extrato.csv",
      mimeType: "text/csv",
      fileText: "Data;Descricao;Valor\n12/05/2026;PIX RECEBIDO;29,90",
      fileHash: "positive-bank-credit",
    });

    expect(parsed.detection.documentType).toBe("BANK_STATEMENT");
    expect(parsed.transactions[0]).toMatchObject({
      transactionDate: "2026-05-12",
      amount: "29.90",
      direction: "CREDIT",
      sourceType: "BANK_ACCOUNT",
    });
  });

  it.each(["banco", "conta", "account", "instituicao"])(
    "recognizes %s as an explicit account column",
    async (accountColumn) => {
      const parsed = await genericCsvParser.parse({
        fileName: "extrato.csv",
        mimeType: "text/csv",
        fileText: `Data;${accountColumn};Descricao;Valor\n12/05/2026;MercadoPago;PIX RECEBIDO;29,90`,
        fileHash: `account-column-${accountColumn}`,
      });

      expect(parsed.detection.institution).toBe("MERCADO_PAGO");
      expect(parsed.metadata.accountColumn).toBe(accountColumn);
      expect(parsed.transactions[0].sourceAccountName).toBe("Mercado Pago");
    },
  );

  it("normalizes Mercado Pago aliases and Mercado Livre only in its card statement", async () => {
    const parsed = await genericCsvParser.parse({
      fileName: "fatura.csv",
      mimeType: "text/csv",
      fileText: `FATURA MERCADO PAGO
Data;Banco;Categoria;Descricao;Valor
12/05/2026;Mercado Pago;Combustivel;MP*PETROBRASPREM;29,90
13/05/2026;MercadoPago;Compras;MERCADOLIVRE*LOJA;40,00
14/05/2026;MP;Pet;PREMMIA*BR;10,00
15/05/2026;Mercado Livre;Compras Online;MERCADOPAGO*XPTO;20,00`,
      fileHash: "mercado-pago-account-aliases",
    });

    expect(parsed.detection).toMatchObject({
      institution: "MERCADO_PAGO",
      documentType: "CREDIT_CARD_STATEMENT",
    });
    expect(parsed.transactions.map((row) => row.sourceAccountName)).toEqual([
      "Mercado Pago",
      "Mercado Pago",
      "Mercado Pago",
      "Mercado Pago",
    ]);
    expect(parsed.transactions[0]).toMatchObject({
      categorySuggestion: "Gasolina",
      direction: "DEBIT",
    });
  });

  it("auto-detects Mercado Pago only when every populated transaction has that account", async () => {
    const parsed = await genericCsvParser.parse({
      fileName: "extrato.csv",
      mimeType: "text/csv",
      fileText: "Data;Banco;Descricao;Valor\n12/05/2026;Mercado Pago;PIX RECEBIDO;29,90\n13/05/2026;;PIX RECEBIDO;10,00",
      fileHash: "partial-mercado-pago-account",
    });

    expect(parsed.detection.institution).toBe("UNKNOWN");
    expect(parsed.transactions[0].sourceAccountName).toBe("Mercado Pago");
    expect(parsed.transactions[1].sourceAccountName).toBeUndefined();
  });

  it("keeps an explicit CSV account above the detected institution and blocks category names", async () => {
    const parsed = await genericCsvParser.parse({
      fileName: "fatura-nubank.csv",
      mimeType: "text/csv",
      fileText: "FATURA NUBANK\nData;Banco;Descricao;Valor\n12/05/2026;MP;MERCADOLIVRE*LOJA;29,90",
      fileHash: "explicit-account-priority",
      manualInstitution: "NUBANK",
    });
    const accounts = [
      { id: "food", name: "Alimentacao", type: "credit_card" },
      { id: "nubank", name: "Cartao Nubank", type: "credit_card", institution: "Nubank" },
      { id: "mp", name: "Mercado Pago", type: "credit_card", institution: "Mercado Pago" },
    ];

    expect(resolveImportedAccountId(parsed.transactions[0], accounts)).toBe("mp");
    expect(normalizeImportedAccountName("Gasolina")).toBeUndefined();
    expect(resolveImportedAccountId({
      ...parsed.transactions[0],
      sourceAccountName: undefined,
      institution: "UNKNOWN",
    }, [accounts[0]])).toBe("");
  });

  it("does not replace an unmatched explicit CSV account with another registered account", async () => {
    const parsed = await genericCsvParser.parse({
      fileName: "extrato.csv",
      mimeType: "text/csv",
      fileText: "Data;Conta;Descricao;Valor\n12/05/2026;Banco Inter;PIX RECEBIDO;29,90",
      fileHash: "unmatched-explicit-account",
    });

    expect(resolveImportedAccountId(parsed.transactions[0], [
      { id: "nubank", name: "Nubank", type: "checking", institution: "Nubank" },
    ])).toBe("");
  });

  it("honors explicit debit and credit columns in a card statement", async () => {
    const parsed = await genericCsvParser.parse({
      fileName: "fatura.csv",
      mimeType: "text/csv",
      fileText: "FATURA DO CARTAO\nData;Descricao;Credito;Debito\n12/05/2026;AMAZON BR;;29,90\n13/05/2026;CREDITO PROMOCIONAL;10,00;",
      fileHash: "card-explicit-columns",
    });

    expect(parsed.transactions.map((transaction) => transaction.direction)).toEqual(["DEBIT", "CREDIT"]);
  });

  it("parses Nubank CSV with Brazilian money and installments", async () => {
    const csv = `date,title,amount
2026-07-15,Domino S Pizzza,"16,90"
2026-07-15,Up Training - Parcela 1/5,"73,20"
2026-07-15,Lojas Renner Fl - Parcela 1/3,"66,64"`;

    const rows = await parseNubankCsvRows(csv);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      transactionDate: "2026-07-15",
      amount: "16.90",
      direction: "DEBIT",
      categorySuggestion: "Alimentacao",
    });
    expect(rows[1].installmentCurrent).toBe(1);
    expect(rows[1].installmentTotal).toBe(5);
    expect(rows[1].descriptionNormalized).toBe("UP TRAINING");
    expect(rows[2].categorySuggestion).toBe("Vestuario");
  });

  it.each(["CIELO", "PAG", "STONE", "MP"])(
    "detects installments and removes the %s card-machine prefix from generic CSV merchants",
    async (prefix) => {
      const parsed = await genericCsvParser.parse({
        fileName: "fatura.csv",
        mimeType: "text/csv",
        fileText: `Data;Descricao;Valor\n25/08/2026;${prefix}*LOJA TESTE - Parcela 2/4;-25,00`,
        fileHash: `generic-installment-${prefix}`,
        manualDocumentType: "CREDIT_CARD_STATEMENT",
      });

      expect(parsed.transactions[0]).toMatchObject({
        descriptionNormalized: `${prefix}*LOJA TESTE`,
        merchantName: "LOJA TESTE",
        installmentCurrent: 2,
        installmentTotal: 4,
      });
    },
  );

  it("advances installment dates month by month without overflowing shorter months", () => {
    expect(addMonthsToIsoDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToIsoDate("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsToIsoDate("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("classifies common market descriptions as food", async () => {
    const csv = `date,title,amount
2026-06-24,Mercadinho Sao Luiz,"151,32"
2026-06-21,Mercadinho Sao Luiz,"32,00"
2026-06-25,MP *HOLYPIZZA,"70,00"`;

    const rows = await parseNubankCsvRows(csv);

    expect(rows.map((row) => row.categorySuggestion)).toEqual(["Alimentacao", "Alimentacao", "Alimentacao"]);
  });

  it.each([
    ["Posto Shell Fortaleza", "Gasolina"],
    ["Uber *Trip", "Uber e Táxi"],
    ["Recarga Bilhete Unico", "Transporte Público"],
    ["Latam Airlines", "Viagens"],
    ["Sem Parar Pedagio", "Carro"],
    ["Oficina Mecanica do Bairro", "Carro"],
  ])("classifies %s as %s", (description, expectedCategory) => {
    expect(suggestCategoryName(description, "DEBIT")).toBe(expectedCategory);
  });

  it.each([
    ["Auto-Peças Avenida", "Carro"],
    ["Lava-Jato Central", "Carro"],
    ["Pneumologia Integrada", "Saude"],
    ["Pagamento de imposto municipal", "Impostos"],
    ["IPVA 2026", "IPVA"],
    ["IPTU cota unica", "IPTU"],
  ])("uses term boundaries when classifying %s", (description, expectedCategory) => {
    expect(suggestCategoryName(description, "DEBIT")).toBe(expectedCategory);
  });

  it.each([
    ["Cafeteria Central", "Alimentacao"],
    ["Pizzas do Bairro", "Alimentacao"],
    ["Dominos", "Alimentacao"],
    ["Postoshell Avenida", "Gasolina"],
    ["Gol *Passagem", "Viagens"],
    ["Azul S/A", "Viagens"],
    ["Tarifas bancarias", "Taxas Bancarias"],
    ["Posto de Saude", "Saude"],
    ["Oficina de Arte", "Educacao"],
    ["Mecanica Quantica Curso", "Educacao"],
    ["Licenciamento Microsoft", "Assinaturas"],
    ["Licenciamento de software", "Outros"],
    ["Licenciamento veiculo 2026", "Carro"],
    ["Postos de Saude", "Saude"],
    ["Posto Fiscal Estadual", "Impostos"],
    ["Posto de Atendimento", "Outros"],
    ["Mercados Avenida", "Alimentacao"],
    ["Combustiveis Avenida", "Gasolina"],
    ["Pousadas Brasil", "Viagens"],
    ["Passagens Aereas", "Viagens"],
    ["Cinemas e Ingressos", "Lazer"],
    ["Tickets do Show", "Lazer"],
    ["Transferencias recebidas", "Entre Contas"],
  ])("handles inflections and ambiguous merchant text in %s", (description, expectedCategory) => {
    expect(suggestCategoryName(description, "DEBIT")).toBe(expectedCategory);
  });

  it("parses Mercado Pago textual statement movements", async () => {
    const text = `
Mercado Pago
Periodo 01/07/2026 a 31/07/2026
Saldo inicial R$ 100,00
15/07/2026 Pix recebido
ID: OP123456
Cliente exemplo R$ 50,00 R$ 150,00
15/07/2026 Pagamento com QR Pix
Mercado do Bairro -R$ 25,90 R$ 124,10
16/07/2026 Dinheiro reservado
Cofrinho viagem -R$ 10,00 R$ 114,10
Saldo final R$ 114,10`;

    const { transactions, warnings } = await parseMercadoPagoTextRows(text);

    expect(warnings).toHaveLength(0);
    expect(transactions).toHaveLength(3);
    expect(transactions[0]).toMatchObject({
      externalId: "OP123456",
      direction: "CREDIT",
      amount: "50.00",
    });
    expect(transactions[1]).toMatchObject({
      direction: "DEBIT",
      amount: "25.90",
    });
    expect(transactions[2].possibleInternalTransfer).toBe(true);
  });

  it("parses Mercado Pago official PDF text with hyphen dates and wrapped lines", async () => {
    const text = `
EXTRATO DE CONTA
Periodo: De 01-06-2026 al 30-06-2026
Data Descrição ID da operação Valor Saldo
01-06-2026 Rendimentos 1744540957205 R$ 0,36 R$ 815,42
Pix recebido GABRIELLA
01-06-2026 MENESES ROCHA BORGES 161164808955 R$ 45,51 R$ 860,93
DE ALBUQUERQUE
02-06-2026 Pix enviado Jaqueline Feitosa 161383359757 R$ -15,00 R$ 5.032,22
Pagamento com QR Pix NU
05-06-2026 162612159672 R$ -3.903,09 R$ 2.133,94
PAGAMENTOS SA
1/5
Data de geração: 15-07-2026`;

    const { transactions, warnings } = await parseMercadoPagoTextRows(text);

    expect(warnings).toHaveLength(0);
    expect(transactions).toHaveLength(4);
    expect(transactions[0]).toMatchObject({
      externalId: "1744540957205",
      transactionDate: "2026-06-01",
      direction: "CREDIT",
      amount: "0.36",
    });
    expect(transactions[1].descriptionOriginal).toContain("DE ALBUQUERQUE");
    expect(transactions[2]).toMatchObject({
      direction: "DEBIT",
      amount: "15.00",
    });
    expect(transactions[3].descriptionOriginal).toContain("PAGAMENTOS SA");
    expect(transactions[3]).toMatchObject({
      direction: "DEBIT",
      amount: "3903.09",
    });
  });

  it("detects official Mercado Pago PDF text even when the brand is not in the header", async () => {
    const text = `
EXTRATO DE CONTA
Marcos Antonio Felix de Oliveira Filho
CPF/CNPJ: 00000000000 Agencia: 1 Conta: 70575983585
Periodo: De 01-06-2026 al 30-06-2026
Entradas: R$ 11.187,28
Saldo inicial: R$ 815,06 Saldo final: R$ 144,12
Saidas: R$ -11.858,22
DETALHE DOS MOVIMENTOS
Data Descricao ID da operacao Valor Saldo
01-06-2026 Rendimentos 1744540957205 R$ 0,36 R$ 815,42`;

    const detection = await mercadoPagoTextParser.canHandle({
      fileName: "dba95e0b-ad91-49e4-b1e7-090d97ad7117.pdf",
      mimeType: "application/pdf",
      fileText: text,
      manualInstitution: "UNKNOWN",
      manualFormat: "UNKNOWN",
      manualDocumentType: "UNKNOWN",
    });

    expect(detection.institution).toBe("MERCADO_PAGO");
    expect(detection.confidence).toBeGreaterThan(0.8);
  });
});
