// ---------------------------------------------------------------------------
// imagePreprocessor.ts
// Canvas-based image preprocessing pipeline to improve Tesseract OCR accuracy.
//
// Processing order matters — each step builds on the last:
//   upscale → grayscale → contrast stretch → binarize → sharpen
//
// All operations run in-browser via the 2D Canvas API with no external deps.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreprocessOptions {
  /**
   * Scale factor applied before all other transforms.
   * Tesseract performs best at ~300 DPI. Most phone screenshots are 72–150 DPI,
   * so 2.0–3.0 is a good starting point.
   * @default 2.5
   */
  scaleFactor?: number;

  /**
   * Contrast stretch: the bottom N% of pixel values are mapped to 0 (black)
   * and the top N% are mapped to 255 (white). Values 1–10 are typical.
   * Higher = more aggressive contrast.
   * @default 5
   */
  contrastClipPercent?: number;

  /**
   * Binarization threshold (0–255). Pixels below this value → black,
   * above → white. Set to null to disable binarization (keep grayscale).
   * For light-mode app screenshots, 180–210 usually works well.
   * @default 190
   */
  binaryThreshold?: number | null;

  /**
   * Apply an unsharp mask after upscaling to recover edge crispness.
   * @default true
   */
  sharpen?: boolean;
}

const DEFAULTS: Required<PreprocessOptions> = {
  scaleFactor: 2.5,
  contrastClipPercent: 5,
  binaryThreshold: 190,
  sharpen: true,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Preprocesses an image File/Blob for improved Tesseract OCR accuracy.
 * Returns a new Blob (PNG) that can be passed directly to `recognizeImage`.
 *
 * @example
 * const processed = await preprocessImage(file);
 * const result = await recognizeImage(processed, onProgress);
 */
export async function preprocessImage(
  source: File | Blob,
  options: PreprocessOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULTS, ...options };

  // Decode the source image into a bitmap
  const bitmap = await createImageBitmap(source);

  // ---- Step 1: Upscale ------------------------------------------------
  const scaledW = Math.round(bitmap.width * opts.scaleFactor);
  const scaledH = Math.round(bitmap.height * opts.scaleFactor);

  const canvas = document.createElement("canvas");
  canvas.width = scaledW;
  canvas.height = scaledH;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2D canvas context");

  // Use high-quality image smoothing for the upscale pass
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, scaledW, scaledH);
  bitmap.close();

  // ---- Step 2: Grayscale + Contrast stretch + Binarize ----------------
  // We do these in a single pixel-loop pass for performance
  const imageData = ctx.getImageData(0, 0, scaledW, scaledH);
  const pixels = imageData.data; // Uint8ClampedArray, RGBA interleaved

  // Convert to grayscale first so we can compute the histogram
  const gray = new Uint8Array(scaledW * scaledH);
  for (let i = 0; i < gray.length; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    // Luminance-weighted grayscale (matches human perception)
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Build histogram and compute contrast-stretch clip points
  const { low, high } = computeClipPoints(gray, opts.contrastClipPercent);

  // Apply contrast stretch + optional binarization back into the ImageData
  const range = high - low || 1; // guard against divide-by-zero
  for (let i = 0; i < gray.length; i++) {
    // Stretch pixel into [0, 255]
    let val = Math.round(((gray[i] - low) / range) * 255);
    val = Math.max(0, Math.min(255, val));

    // Optionally binarize
    if (opts.binaryThreshold !== null) {
      val = val >= opts.binaryThreshold ? 255 : 0;
    }

    // Write back as grayscale (R=G=B, A=255)
    pixels[i * 4] = val;
    pixels[i * 4 + 1] = val;
    pixels[i * 4 + 2] = val;
    pixels[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  // ---- Step 3: Sharpen (unsharp mask via CSS filter) ------------------
  // We composite the sharpened version onto a fresh canvas using a
  // convolution kernel approach. CSS filter sharpening is not available
  // on OffscreenCanvas, so we use a manual 3×3 laplacian kernel instead.
  if (opts.sharpen) {
    applyLaplacianSharpen(ctx, scaledW, scaledH);
  }

  // ---- Export to Blob -------------------------------------------------
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      },
      "image/png" // PNG is lossless — important for OCR
    );
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a 256-bucket histogram of grayscale values and returns the pixel
 * intensity values that correspond to the bottom and top clip percentiles.
 *
 * e.g. clipPercent=5 → clip the darkest 5% and brightest 5% of pixels.
 */
function computeClipPoints(
  gray: Uint8Array,
  clipPercent: number
): { low: number; high: number } {
  const histogram = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;

  const totalPixels = gray.length;
  const clipCount = Math.round((clipPercent / 100) * totalPixels);

  let low = 0;
  let accumulated = 0;
  for (let v = 0; v < 256; v++) {
    accumulated += histogram[v];
    if (accumulated >= clipCount) {
      low = v;
      break;
    }
  }

  let high = 255;
  accumulated = 0;
  for (let v = 255; v >= 0; v--) {
    accumulated += histogram[v];
    if (accumulated >= clipCount) {
      high = v;
      break;
    }
  }

  // Ensure low < high to avoid degenerate range
  if (low >= high) return { low: 0, high: 255 };
  return { low, high };
}

/**
 * Applies a 3×3 Laplacian sharpening kernel in-place on the canvas context.
 *
 * Kernel:
 *   [ 0, -1,  0]
 *   [-1,  5, -1]
 *   [ 0, -1,  0]
 *
 * This enhances edges without amplifying diagonal noise — well-suited for
 * the horizontal/vertical text structure in app screenshots.
 */
function applyLaplacianSharpen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const s = src.data;
  const d = dst.data;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        // 5-tap Laplacian: center*5 minus 4 cardinal neighbors
        const sharpened =
          5 * s[idx + c] -
          s[((y - 1) * w + x) * 4 + c] -
          s[((y + 1) * w + x) * 4 + c] -
          s[(y * w + (x - 1)) * 4 + c] -
          s[(y * w + (x + 1)) * 4 + c];
        d[idx + c] = Math.max(0, Math.min(255, sharpened));
      }
      d[idx + 3] = 255; // alpha
    }
  }

  // Copy border pixels unchanged to avoid edge artifacts
  for (let x = 0; x < w; x++) {
    copyPixel(s, d, x, 0, w);
    copyPixel(s, d, x, h - 1, w);
  }
  for (let y = 0; y < h; y++) {
    copyPixel(s, d, 0, y, w);
    copyPixel(s, d, w - 1, y, w);
  }

  ctx.putImageData(dst, 0, 0);
}

/** Copies a single RGBA pixel from src to dst at (x, y). */
function copyPixel(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  x: number,
  y: number,
  w: number
): void {
  const idx = (y * w + x) * 4;
  dst[idx] = src[idx];
  dst[idx + 1] = src[idx + 1];
  dst[idx + 2] = src[idx + 2];
  dst[idx + 3] = src[idx + 3];
}
