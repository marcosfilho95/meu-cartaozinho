import { ExistingTransactionMatch, FinancialFileParser, ParserContext } from "./types";
import { markDuplicates, sha256Hex } from "./utils";
import { mercadoPagoTextParser } from "./mercadoPagoTextParser";
import { mercadoPagoCardPdfParser } from "./mercadoPagoCardPdfParser";
import { nubankCsvParser } from "./nubankCsvParser";
import { genericCsvParser } from "./genericCsvParser";
import { genericTextParser } from "./genericTextParser";
import { picpayPdfParser } from "./picpayPdfParser";
import { nubankPdfParser } from "./nubankPdfParser";
import { ofxParser } from "./ofxParser";
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
export { ofxParser } from "./ofxParser";
export * from "./financialRules";
export * from "./reconciliation";
export * from "./vision";
export * from "./classifier";

// Order matters: specific parsers first, generic fallbacks last.
export const financialFileParsers: FinancialFileParser[] = [
  ofxParser,
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
export const isImageFile = (file: File) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/i.test(file.name);

export const extractPdfText = async (file: File) => {
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

export const isPdfTextSufficient = (text: string) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 80) return false;
  const hasDate = /\b(?:\d{2}[/-]\d{2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/.test(normalized);
  const hasMoney = /(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+\.\d{2}/.test(normalized);
  return hasDate && hasMoney;
};

const canvasToDataUrl = (canvas: HTMLCanvasElement, quality = 0.78) => canvas.toDataURL("image/jpeg", quality);

export const renderPdfPagesToImages = async (
  file: File,
  onProgress?: (completed: number, total: number) => void,
) => {
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const images: Array<{ pageNumber: number; dataUrl: string }> = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1800 / Math.max(baseViewport.width, 1));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Não foi possível preparar a página do PDF para leitura por imagem.");
    await page.render({ canvasContext: context, viewport }).promise;
    images.push({ pageNumber, dataUrl: canvasToDataUrl(canvas) });
    canvas.width = 1;
    canvas.height = 1;
    onProgress?.(pageNumber, document.numPages);
  }
  return images;
};

export const optimizeImageFile = async (file: File, rotation = 0): Promise<string> => {
  if (!isImageFile(file)) throw new Error("Formato de imagem não suportado.");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
      img.src = sourceUrl;
    });
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const turn = ((rotation % 360) + 360) % 360;
    const swap = turn === 90 || turn === 270;
    const canvas = window.document.createElement("canvas");
    canvas.width = swap ? height : width;
    canvas.height = swap ? width : height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Não foi possível preparar a imagem.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((turn * Math.PI) / 180);
    context.drawImage(image, -width / 2, -height / 2, width, height);
    return canvasToDataUrl(canvas);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

export const readFileAsText = async (file: File) => {
  if (isPdfFile(file)) return extractPdfText(file);
  if (/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
    const { spreadsheetBufferToCsv } = await import("./xlsx");
    return spreadsheetBufferToCsv(await file.arrayBuffer());
  }

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
