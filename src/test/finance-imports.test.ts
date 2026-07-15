import { describe, expect, it } from "vitest";
import { mercadoPagoTextParser, parseMercadoPagoTextRows } from "@/lib/finance/imports/mercadoPagoTextParser";
import { parseNubankCsvRows } from "@/lib/finance/imports/nubankCsvParser";
import { suggestCategoryName } from "@/lib/finance/imports/utils";

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
    expect(rows[2].categorySuggestion).toBe("Vestuario");
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
