/**
 * OCR carregado sob demanda. O pacote e o modelo de idioma só são baixados
 * quando a leitura online não identifica nada na imagem.
 */
export const recognizeFinancialImageLocally = async (imageDataUrl: string) => {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por");
  try {
    const result = await worker.recognize(imageDataUrl);
    return String(result.data.text || "").trim();
  } finally {
    await worker.terminate();
  }
};
