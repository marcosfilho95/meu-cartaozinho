import { describe, expect, it } from "vitest";
import { parseMercadoPagoTextRows } from "@/lib/finance/imports/mercadoPagoTextParser";
import { parseNubankCsvRows } from "@/lib/finance/imports/nubankCsvParser";

describe("financial imports", () => {
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
    expect(rows[2].categorySuggestion).toBe("Vestuário");
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
});
