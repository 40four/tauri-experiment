// ---------------------------------------------------------------------------
// ocr.ts
// Thin wrapper around Tesseract.js with an optional image preprocessing step.
//
// The worker is lazily initialized and reused across calls to avoid the
// ~500ms initialization overhead on every image. Call `terminateOcr()` on
// app unmount if you need to free the WASM memory.
// ---------------------------------------------------------------------------

import { createWorker, type Worker } from "tesseract.js";
import { preprocessImage, type PreprocessOptions } from "@/lib/imagePreprocessor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OcrResult {
  text: string;
  confidence: number;
  /**
   * Object URL pointing to the preprocessed PNG blob, available when
   * preprocess=true. Caller is responsible for revoking this URL when done
   * (e.g. on card removal) to avoid memory leaks.
   */
  preprocessedUrl?: string;
}

export type OcrProgressCallback = (progress: number, status: string) => void;

export interface RecognizeOptions {
  /**
   * When true, the image is run through the preprocessing pipeline before
   * being handed to Tesseract. Recommended for phone screenshots.
   * @default true
   */
  preprocess?: boolean;

  /** Fine-tune preprocessing behavior. Only used when preprocess=true. */
  preprocessOptions?: PreprocessOptions;
}

// ---------------------------------------------------------------------------
// Worker singleton
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs OCR on an image, with optional canvas preprocessing to improve
 * accuracy on phone screenshots (see `RecognizeOptions.preprocess`).
 *
 * Progress callbacks fire at two phases:
 *   - "preprocessing"    (fires at 0% and 20%) — canvas pipeline
 *   - "recognizing text" (0–100%)               — Tesseract internal progress
 *
 * When preprocessing is enabled, `result.preprocessedUrl` will contain an
 * object URL for the processed PNG. Revoke it with `URL.revokeObjectURL`
 * when the entry is removed.
 */
export async function recognizeImage(
  image: File | Blob | string,
  onProgress?: OcrProgressCallback,
  { preprocess = true, preprocessOptions }: RecognizeOptions = {}
): Promise<OcrResult> {
  let source: File | Blob | string = image;
  let preprocessedUrl: string | undefined;

  // ---- Optional preprocessing pass ------------------------------------
  if (preprocess && typeof image !== "string") {
    onProgress?.(0, "preprocessing");
    const blob = await preprocessImage(image, preprocessOptions);
    preprocessedUrl = URL.createObjectURL(blob);
    source = blob;
    onProgress?.(20, "preprocessing");
  }

  // ---- Tesseract recognition ------------------------------------------
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(source);

  return { text: data.text, confidence: data.confidence, preprocessedUrl };
}

export async function terminateOcr(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }
}
