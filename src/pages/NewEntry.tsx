import * as React from "react";
import { ImagePlus, X, ScanText, Clipboard, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { recognizeImage, type OcrProgressCallback } from "@/lib/ocr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OcrStatus = "idle" | "loading" | "done" | "error";

interface ImageEntry {
  id: string;
  file: File;
  /** Object URL for preview — remember to revoke on cleanup */
  previewUrl: string;
  status: OcrStatus;
  /** OCR output text, null until complete */
  result: string | null;
  /** Tesseract confidence score (0–100) */
  confidence: number | null;
  errorMessage?: string;
  progress: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createImageEntry(file: File): ImageEntry {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    status: "idle",
    result: null,
    confidence: null,
    progress: 0,
  };
}

function confidenceBadgeVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 80) return "default";
  if (score >= 50) return "secondary";
  return "destructive";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Empty state / dropzone prompt */
function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length) onFiles(files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    // Reset input so re-selecting same file triggers onChange
    e.target.value = "";
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer select-none",
        isDragging
          ? "border-primary bg-primary/5 text-primary"
          : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground",
      ].join(" ")}
    >
      <ImagePlus className="size-10" strokeWidth={1.25} />
      <div>
        <p className="text-sm font-medium">Drop screenshots here</p>
        <p className="text-xs mt-1">or click to browse — PNG, JPG, WEBP accepted</p>
      </div>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}

/** Single image card showing preview, status, and OCR result */
function ImageCard({
  entry,
  onRemove,
  onRunOcr,
  onCopyResult,
  copied,
}: {
  entry: ImageEntry;
  onRemove: (id: string) => void;
  onRunOcr: (id: string) => void;
  onCopyResult: (id: string) => void;
  copied: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      {/* Preview */}
      <div className="relative bg-muted/40">
        <img
          src={entry.previewUrl}
          alt={entry.file.name}
          className="w-full object-contain max-h-48"
        />
        {/* Remove button */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-2 right-2 size-6 rounded-full opacity-80 hover:opacity-100"
          onClick={() => onRemove(entry.id)}
          disabled={entry.status === "loading"}
        >
          <X className="size-3" />
          <span className="sr-only">Remove image</span>
        </Button>
        {/* Status badge */}
        {entry.status !== "idle" && (
          <div className="absolute bottom-2 left-2">
            {entry.status === "loading" && (
              <Badge variant="secondary">Processing…</Badge>
            )}
            {entry.status === "done" && entry.confidence !== null && (
              <Badge variant={confidenceBadgeVariant(entry.confidence)}>
                {entry.confidence.toFixed(0)}% confidence
              </Badge>
            )}
            {entry.status === "error" && (
              <Badge variant="destructive">Error</Badge>
            )}
          </div>
        )}
      </div>

      <CardContent className="p-3 space-y-2">
        {/* File name */}
        <p className="text-xs text-muted-foreground truncate" title={entry.file.name}>
          {entry.file.name}
        </p>

        {/* Progress bar shown while loading */}
        {entry.status === "loading" && (
          <Progress value={entry.progress} className="h-1" />
        )}

        {/* OCR result text */}
        {entry.status === "done" && entry.result && (
          <>
            <Separator />
            <ScrollArea className="h-32 w-full rounded-md">
              <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed p-1">
                {entry.result}
              </pre>
            </ScrollArea>
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={() => onCopyResult(entry.id)}
            >
              {copied ? <Check className="size-3" /> : <Clipboard className="size-3" />}
              {copied ? "Copied!" : "Copy text"}
            </Button>
          </>
        )}

        {/* Error message */}
        {entry.status === "error" && (
          <p className="text-xs text-destructive">{entry.errorMessage}</p>
        )}

        {/* Run OCR button — shown when idle or on error */}
        {(entry.status === "idle" || entry.status === "error") && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={() => onRunOcr(entry.id)}
          >
            <ScanText className="size-3" />
            Run OCR
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// NewEntry Page
// ---------------------------------------------------------------------------

export function NewEntry() {
  const [entries, setEntries] = React.useState<ImageEntry[]>([]);
  // Track which card's copy button was just clicked (for the "Copied!" flash)
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Clean up object URLs when entries are removed to avoid memory leaks
  React.useEffect(() => {
    return () => {
      entries.forEach((e) => URL.revokeObjectURL(e.previewUrl));
    };
  }, []);

  // -- Handlers --

  function handleFiles(files: File[]) {
    const newEntries = files.map(createImageEntry);
    setEntries((prev) => [...prev, ...newEntries]);
  }

  function handleRemove(id: string) {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((e) => e.id !== id);
    });
  }

  async function handleRunOcr(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;

    // Set loading state
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "loading", progress: 0 } : e))
    );

    const onProgress: OcrProgressCallback = (progress, status) => {
      // Only update during the actual recognition phase to keep the bar meaningful
      if (status === "recognizing text") {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, progress } : e))
        );
      }
    };

    try {
      const result = await recognizeImage(entry.file, onProgress);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "done",
                result: result.text.trim(),
                confidence: result.confidence,
                progress: 100,
              }
            : e
        )
      );
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "error",
                errorMessage: err instanceof Error ? err.message : "OCR failed",
                progress: 0,
              }
            : e
        )
      );
    }
  }

  async function handleRunAll() {
    // Run OCR on all idle or errored entries in parallel
    const targets = entries.filter((e) => e.status === "idle" || e.status === "error");
    await Promise.all(targets.map((e) => handleRunOcr(e.id)));
  }

  async function handleCopyResult(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry?.result) return;
    await navigator.clipboard.writeText(entry.result);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  // -- Derived state --
  const hasEntries = entries.length > 0;
  const hasRunnable = entries.some((e) => e.status === "idle" || e.status === "error");
  const isAnyLoading = entries.some((e) => e.status === "loading");

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-4">
      {/* Page header */}
      <Card>
        <CardHeader>
          <CardTitle>New Entry</CardTitle>
          <CardDescription>
            Add screenshots to extract text via OCR. Supports PNG, JPG, and WEBP.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Dropzone — always visible so more images can be added */}
      <Dropzone onFiles={handleFiles} />

      {/* Bulk action */}
      {hasEntries && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {entries.length} image{entries.length !== 1 ? "s" : ""} added
          </p>
          <div className="flex gap-2">
            {hasRunnable && (
              <Button
                size="sm"
                onClick={handleRunAll}
                disabled={isAnyLoading}
                className="gap-1.5"
              >
                <ScanText className="size-4" />
                Run all OCR
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                entries.forEach((e) => URL.revokeObjectURL(e.previewUrl));
                setEntries([]);
              }}
              disabled={isAnyLoading}
            >
              Clear all
            </Button>
          </div>
        </div>
      )}

      {/* Image grid */}
      {hasEntries && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((entry) => (
            <ImageCard
              key={entry.id}
              entry={entry}
              onRemove={handleRemove}
              onRunOcr={handleRunOcr}
              onCopyResult={handleCopyResult}
              copied={copiedId === entry.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
