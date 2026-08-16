import * as XLSX from "xlsx";

/**
 * Conversão real de planilhas (XLSX/XLS) em CSV, para reaproveitar os parsers
 * tabulares já existentes. Escolhe a primeira aba com conteúdo.
 */
export const isSpreadsheetFileName = (fileName: string) => /\.(xlsx|xls|xlsm)$/i.test(fileName);

export const spreadsheetBufferToCsv = (buffer: ArrayBuffer): string => {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    csv: XLSX.utils.sheet_to_csv(workbook.Sheets[name], { FS: ",", blankrows: false, dateNF: "yyyy-mm-dd" }).trim(),
  })).filter((s) => s.csv.length > 0);
  if (sheets.length === 0) throw new Error("Planilha vazia: nenhuma aba com dados.");
  return sheets.sort((a, b) => b.csv.length - a.csv.length)[0].csv;
};