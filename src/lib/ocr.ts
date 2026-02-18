import { createWorker, type Worker } from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number;
}

export type OcrProgressCallback = (progress: number, status: string) => void;

let workerInstance: Worker | null = null;
let initPromise: Promise<Worker> | null = null;

async function getWorker(onProgress?: OcrProgressCallback): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // No custom paths needed — Tesseract.js loads from unpkg.com by default
    const worker = await createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (onProgress && typeof m.progress === "number") {
          onProgress(Math.round(m.progress * 100), m.status);
        }
      },
    });
    workerInstance = worker;
    initPromise = null;
    return worker;
  })();

  return initPromise;
}

export async function recognizeImage(
  image: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(image);
  return { text: data.text, confidence: data.confidence };
}

export async function terminateOcr(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }
}
