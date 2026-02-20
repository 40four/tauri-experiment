// ---------------------------------------------------------------------------
// imagePreprocessor.ts
// Canvas-based image preprocessing pipeline to improve Tesseract OCR accuracy.
//
// Processing order matters — each step builds on the last:
//   upscale → denoise → grayscale → contrast stretch → (auto-invert) →
//   binarize (global or adaptive) → sharpen → pad
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
   * When true, the pipeline inspects the median grayscale value after contrast
   * stretch to guess whether the image is dark-mode (light text on dark bg).
   * If the image looks dark-mode, pixel values are inverted before binarization
   * so that text always ends up black on white — the orientation Tesseract
   * strongly prefers.
   *
   * Set to false if you want to control inversion manually via `forceInvert`.
   * @default true
   */
  autoInvert?: boolean;

  /**
   * When `autoInvert` is false, this forces an explicit inversion pass.
   * Has no effect when `autoInvert` is true (auto-detection takes precedence).
   * @default false
   */
  forceInvert?: boolean;

  /**
   * Binarization mode:
   *   "global"   — single threshold value applied to every pixel (fast, works
   *                well when contrast is uniform across the whole image).
   *   "adaptive" — threshold is computed per-pixel from the local neighborhood
   *                mean, then offset by `adaptiveBias`. Far more robust for
   *                images with uneven lighting, gradients, or dark sidebars.
   *   null       — skip binarization entirely and keep grayscale output.
   * @default "global"
   */
  binarizeMode?: "global" | "adaptive" | null;

  /**
   * Global binarization threshold (0–255). Only used when binarizeMode="global".
   * Pixels at or above this value → white, below → black.
   * For typical dark-mode screenshots (after auto-invert), 128–160 works well.
   * For light-mode, 160–210 is more appropriate.
   * @default 160
   */
  binaryThreshold?: number;

  /**
   * Neighborhood radius (in scaled pixels) used by the adaptive threshold.
   * Larger values smooth out more global lighting variation; smaller values
   * respond to finer local structure. 15–40 px is a sensible range.
   * Only used when binarizeMode="adaptive".
   * @default 25
   */
  adaptiveRadius?: number;

  /**
   * Bias subtracted from the local neighborhood mean before thresholding.
   * A negative bias (e.g. −10) makes the threshold more lenient, preserving
   * thin strokes. A positive bias is more aggressive.
   * Only used when binarizeMode="adaptive".
   * @default -10
   */
  adaptiveBias?: number;

  /**
   * Box-blur radius (in scaled pixels) applied to the grayscale image BEFORE
   * binarization. This kills JPEG compression noise and aliasing that would
   * otherwise fragment characters. Set to 0 to disable.
   * 1–2 px is usually enough; larger values blur fine strokes.
   * @default 1
   */
  denoiseRadius?: number;

  /**
   * Apply an unsharp mask after binarization to recover edge crispness.
   * @default true
   */
  sharpen?: boolean;

  /**
   * Controls the strength of the Laplacian sharpening kernel.
   * The center weight of the 5-tap kernel — higher = crisper but can
   * introduce ringing on noisy images.
   *   4.5 — gentle
   *   5.0 — default (original behavior)
   *   6.5 — aggressive
   * @default 5.0
   */
  sharpenStrength?: number;

  /**
   * Pixels of white padding added around the final binarized image on every
   * side. Tesseract can misread characters that run flush to the canvas edge.
   * 8–20 px (at scaled resolution) is typically enough.
   * @default 12
   */
  paddingPx?: number;
}

const DEFAULTS: Required<PreprocessOptions> = {
  scaleFactor: 2.5,
  contrastClipPercent: 5,
  autoInvert: true,
  forceInvert: false,
  binarizeMode: "global",
  binaryThreshold: 160,
  adaptiveRadius: 25,
  adaptiveBias: -10,
  denoiseRadius: 1,
  sharpen: true,
  sharpenStrength: 5.0,
  paddingPx: 12,
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

  // ---- Step 2: Grayscale ----------------------------------------------
  const imageData = ctx.getImageData(0, 0, scaledW, scaledH);
  const pixels = imageData.data; // Uint8ClampedArray, RGBA interleaved

  // Convert to a flat grayscale array for subsequent processing
  const gray = new Uint8Array(scaledW * scaledH);
  for (let i = 0; i < gray.length; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    // Luminance-weighted grayscale (matches human perception)
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // ---- Step 3: Denoise (box blur) -------------------------------------
  // Applied in grayscale space before contrast stretch so noise doesn't
  // get amplified by the stretch. Kills JPEG block-artifacts efficiently.
  const denoised =
    opts.denoiseRadius > 0
      ? applyBoxBlur(gray, scaledW, scaledH, opts.denoiseRadius)
      : gray;

  // ---- Step 4: Contrast stretch ---------------------------------------
  const { low, high } = computeClipPoints(denoised, opts.contrastClipPercent);
  const range = high - low || 1; // guard against divide-by-zero

  const stretched = new Uint8Array(denoised.length);
  for (let i = 0; i < denoised.length; i++) {
    const val = Math.round(((denoised[i] - low) / range) * 255);
    stretched[i] = Math.max(0, Math.min(255, val));
  }

  // ---- Step 5: Auto-invert (dark-mode detection) ----------------------
  // We want text to be dark (low value) after binarization so Tesseract
  // reads it correctly. If the image is dark-mode (light text, dark bg),
  // we invert so text → dark before thresholding.
  let shouldInvert = opts.forceInvert;
  if (opts.autoInvert) {
    const median = computeMedian(stretched);
    // If the median pixel is below 128 the image is predominantly dark →
    // dark-mode screenshot with light text → invert before binarizing.
    shouldInvert = median < 128;
  }

  const oriented = new Uint8Array(stretched.length);
  for (let i = 0; i < stretched.length; i++) {
    oriented[i] = shouldInvert ? 255 - stretched[i] : stretched[i];
  }

  // ---- Step 6: Binarize -----------------------------------------------
  let binarized: Uint8Array;

  if (opts.binarizeMode === "global") {
    binarized = applyGlobalThreshold(oriented, opts.binaryThreshold);
  } else if (opts.binarizeMode === "adaptive") {
    binarized = applyAdaptiveThreshold(
      oriented,
      scaledW,
      scaledH,
      opts.adaptiveRadius,
      opts.adaptiveBias
    );
  } else {
    // No binarization — keep the oriented grayscale
    binarized = oriented;
  }

  // ---- Step 7: Write back to canvas -----------------------------------
  for (let i = 0; i < binarized.length; i++) {
    pixels[i * 4] = binarized[i];
    pixels[i * 4 + 1] = binarized[i];
    pixels[i * 4 + 2] = binarized[i];
    pixels[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  // ---- Step 8: Sharpen (unsharp mask via 5-tap Laplacian) -------------
  if (opts.sharpen) {
    applyLaplacianSharpen(ctx, scaledW, scaledH, opts.sharpenStrength);
  }

  // ---- Step 9: Pad ----------------------------------------------------
  // Copy the sharpened image onto a new, slightly larger white canvas so
  // Tesseract never sees text flush against the canvas boundary.
  const finalCanvas = applyPadding(canvas, scaledW, scaledH, opts.paddingPx);

  // ---- Export to Blob -------------------------------------------------
  return new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob(
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
 * Returns the median value of a Uint8Array.
 * Uses a histogram for O(n) performance instead of sorting.
 */
function computeMedian(gray: Uint8Array): number {
  const histogram = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;

  const half = gray.length / 2;
  let accumulated = 0;
  for (let v = 0; v < 256; v++) {
    accumulated += histogram[v];
    if (accumulated >= half) return v;
  }
  return 128; // fallback
}

/**
 * Simple global (Otsu-style fixed) threshold.
 * Pixels >= threshold → 255 (white), < threshold → 0 (black).
 * After auto-invert, text pixels will be dark so they end up as 0.
 */
function applyGlobalThreshold(gray: Uint8Array, threshold: number): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] >= threshold ? 255 : 0;
  }
  return out;
}

/**
 * Integral-image-based adaptive threshold (Sauvola-inspired).
 *
 * For each pixel, the threshold is the local mean over a (2r+1)×(2r+1)
 * neighborhood, offset by `bias`. This handles images where background
 * brightness varies spatially (gradient UIs, dark sidebars, etc.).
 *
 * Uses a summed-area table (SAT) so each pixel is O(1) regardless of radius.
 */
function applyAdaptiveThreshold(
  gray: Uint8Array,
  w: number,
  h: number,
  radius: number,
  bias: number
): Uint8Array {
  // Build integral image (summed-area table) using 32-bit ints.
  // sat[y * w + x] = sum of all gray[j][i] for j <= y, i <= x.
  const sat = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const above = y > 0 ? sat[(y - 1) * w + x] : 0;
      const left = x > 0 ? sat[y * w + (x - 1)] : 0;
      const aboveLeft = y > 0 && x > 0 ? sat[(y - 1) * w + (x - 1)] : 0;
      sat[idx] = gray[idx] + above + left - aboveLeft;
    }
  }

  const out = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Clamp the neighborhood window to image boundaries
      const x0 = Math.max(0, x - radius);
      const y0 = Math.max(0, y - radius);
      const x1 = Math.min(w - 1, x + radius);
      const y1 = Math.min(h - 1, y + radius);

      // Area of the actual window (may be smaller near edges)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);

      // Rectangle sum from the SAT
      const sumBR = sat[y1 * w + x1];
      const sumTR = y0 > 0 ? sat[(y0 - 1) * w + x1] : 0;
      const sumBL = x0 > 0 ? sat[y1 * w + (x0 - 1)] : 0;
      const sumTL = y0 > 0 && x0 > 0 ? sat[(y0 - 1) * w + (x0 - 1)] : 0;
      const localSum = sumBR - sumTR - sumBL + sumTL;

      const localMean = localSum / area + bias;
      const idx = y * w + x;
      out[idx] = gray[idx] >= localMean ? 255 : 0;
    }
  }
  return out;
}

/**
 * Fast box blur using two-pass (horizontal then vertical) 1D convolution.
 * O(n) regardless of radius — much cheaper than naive O(n·r²) approach.
 */
function applyBoxBlur(
  gray: Uint8Array,
  w: number,
  h: number,
  radius: number
): Uint8Array {
  const tmp = new Uint8Array(gray.length);
  const out = new Uint8Array(gray.length);
  const diameter = 2 * radius + 1;

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    let sum = 0;
    // Seed the initial window
    for (let dx = -radius; dx <= radius; dx++) {
      sum += gray[y * w + Math.max(0, Math.min(w - 1, dx))];
    }
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = Math.round(sum / diameter);
      const enter = gray[y * w + Math.min(w - 1, x + radius + 1)];
      const exit = gray[y * w + Math.max(0, x - radius)];
      sum += enter - exit;
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      sum += tmp[Math.max(0, Math.min(h - 1, dy)) * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / diameter);
      const enter = tmp[Math.min(h - 1, y + radius + 1) * w + x];
      const exit = tmp[Math.max(0, y - radius) * w + x];
      sum += enter - exit;
    }
  }

  return out;
}

/**
 * Applies a 3×3 Laplacian sharpening kernel in-place on the canvas context.
 *
 * Kernel (parameterized by `strength` s):
 *   [ 0,   arm,  0  ]
 *   [ arm,   s, arm ]
 *   [ 0,   arm,  0  ]
 *
 * where arm = -((s - 1) / 4), so the kernel sums to 1 (no net brightness shift).
 * For s=5 this reduces to the classic [-1, -1, 5, -1, -1] kernel used in v1.
 * Increasing s sharpens more aggressively; decreasing toward 4.0 is gentler.
 *
 * This enhances edges without amplifying diagonal noise — well-suited for
 * the horizontal/vertical text structure in app screenshots.
 */
function applyLaplacianSharpen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number
): void {
  // Neighbor weight derived from kernel normalization: center=s, 4 arms=-(s-1)/4
  const center = strength;
  const arm = -((strength - 1) / 4);

  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const s = src.data;
  const d = dst.data;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const sharpened =
          center * s[idx + c] +
          arm * s[((y - 1) * w + x) * 4 + c] +
          arm * s[((y + 1) * w + x) * 4 + c] +
          arm * s[(y * w + (x - 1)) * 4 + c] +
          arm * s[(y * w + (x + 1)) * 4 + c];
        d[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
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

/**
 * Returns a new canvas with the source image centered on a white background
 * with `padding` pixels of white space on every side.
 *
 * Tesseract misreads characters that run flush to the image boundary, so
 * adding a small buffer significantly improves edge-of-image accuracy.
 */
function applyPadding(
  src: HTMLCanvasElement,
  w: number,
  h: number,
  padding: number
): HTMLCanvasElement {
  const padded = document.createElement("canvas");
  padded.width = w + padding * 2;
  padded.height = h + padding * 2;

  const ctx = padded.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context for padding");

  // Fill white background first
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, padded.width, padded.height);

  // Draw the processed image inset by padding
  ctx.drawImage(src, padding, padding);

  return padded;
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
