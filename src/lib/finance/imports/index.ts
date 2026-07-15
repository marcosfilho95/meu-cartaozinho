import { ExistingTransactionMatch, FinancialFileParser, ParserContext } from "./types";
import { markDuplicates, sha256Hex } from "./utils";
import { mercadoPagoTextParser } from "./mercadoPagoTextParser";
import { mercadoPagoCardPdfParser } from "./mercadoPagoCardPdfParser";
import { nubankCsvParser } from "./nubankCsvParser";
import { genericCsvParser } from "./genericCsvParser";
import { genericTextParser } from "./genericTextParser";
import { picpayPdfParser } from "./picpayPdfParser";
import { nubankPdfParser } from "./nubankPdfParser";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

export * from "./types";
export * from "./utils";
export { mercadoPagoTextParser } from "./mercadoPagoTextParser";
export { mercadoPagoCardPdfParser } from "./mercadoPagoCardPdfParser";
export { nubankCsvParser } from "./nubankCsvParser";
export { genericCsvParser } from "./genericCsvParser";
export { genericTextParser } from "./genericTextParser";
export { picpayPdfParser } from "./picpayPdfParser";
export { nubankPdfParser } from "./nubankPdfParser";
export * from "./classifier";

// Order matters: specific parsers first, generic fallbacks last.
export const financialFileParsers: FinancialFileParser[] = [
  nubankCsvParser,
  nubankPdfParser,
  picpayPdfParser,
  mercadoPagoCardPdfParser,
  mercadoPagoTextParser,
  genericCsvParser,
  genericTextParser,
];

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const isPdfFile = (file: File) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const extractPdfText = async (file: File) => {
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentY: number | null = null;
    let currentLine: string[] = [];
    const rawItems = content.items as Array<{ str?: string; transform?: number[] }>;
    const items = rawItems
      .filter((item) => item.str && item.transform && item.str.trim().length > 0)
      .map((item) => ({
        text: item.str || "",
        x: Array.isArray(item.transform) ? item.transform[4] : 0,
        y: Array.isArray(item.transform) ? item.transform[5] : 0,
      }))
      .sort((a, b) => {
        if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
        return a.x - b.x;
      });

    for (const item of items) {
      if (currentY !== null && Math.abs(currentY - item.y) > 2) {
        if (currentLine.length > 0) lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
        currentLine = [];
      }

      currentY = item.y;
      currentLine.push(item.text);
    }

    if (currentLine.length > 0) lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
    pages.push(lines.filter(Boolean).join("\n"));
  }

  return pages.join("\n");
};

export const readFileAsText = async (file: File) => {
  if (isPdfFile(file)) return extractPdfText(file);

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
    reader.readAsText(file, "utf-8");
  });
};

export const getFileHash = async (file: File) => sha256Hex(await file.arrayBuffer());

export const parseFinancialFile = async (context: ParserContext, existingTransactions: ExistingTransactionMatch[] = []) => {
  const detections = await Promise.all(
    financialFileParsers.map(async (parser) => {
      try {
        return { parser, detection: await parser.canHandle(context) };
      } catch (error) {
        return {
          parser,
          detection: {
            confidence: 0,
            institution: "UNKNOWN" as const,
            documentType: "UNKNOWN" as const,
            format: "UNKNOWN" as const,
            reason: `erro na deteccao: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    }),
  );
  const best = detections.sort((a, b) => b.detection.confidence - a.detection.confidence)[0];

  if (!best || best.detection.confidence <= 0) {
    const summary = detections
      .map((d) => `${d.parser.name}=${d.detection.confidence.toFixed(2)} (${d.detection.reason})`)
      .join(" | ");
    console.warn("[parseFinancialFile] nenhum parser reconheceu o arquivo", {
      fileName: context.fileName,
      textPreview: context.fileText.slice(0, 400),
      detections: detections.map((d) => ({ name: d.parser.name, ...d.detection })),
    });
    throw new Error(
      `Formato ainda não reconhecido. Selecione instituição e tipo manualmente ou use Nubank CSV / Mercado Pago textual. [detecções: ${summary}]`,
    );
  }

  const parsed = await best.parser.parse(context);
  return {
    ...parsed,
    transactions: markDuplicates(parsed.transactions, existingTransactions),
  };
};
