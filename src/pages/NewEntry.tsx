// ---------------------------------------------------------------------------
// NewEntry Page
// Handles image upload, OCR processing, and triggering the EntryReviewSheet
// for each completed OCR result.
// ---------------------------------------------------------------------------

import * as React from "react";
import { ImagePlus, X, ScanText, Clipboard, Check, BookOpen, Expand } from "lucide-react";

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
import { EntryReviewModal } from "@/components/entry-review/EntryReviewModal";
import { ImageLightbox } from "@/components/image-lightbox/ImageLightbox";

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
  /** True once this entry has been saved to the DB */
  saved: boolean;
  /** Object URL for the preprocessed PNG — set after OCR runs, revoke on removal */
  preprocessedUrl: string | null;
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
    saved: false,
    preprocessedUrl: null,
  };
}

function confidenceBadgeVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 80) return "default";
  if (score >= 50) return "secondary";
  return "destructive";
}

// ---------------------------------------------------------------------------
// Dropzone
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
    const files = Array.from(e.target.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length) onFiles(files);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
      <ImagePlus className="mx-auto size-8 text-muted-foreground mb-2" />
      <p className="text-sm font-medium">Drop images here or click to browse</p>
      <p className="text-xs text-muted-foreground mt-1">Supports PNG, JPG, and WEBP.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageCard
// ---------------------------------------------------------------------------

interface ImageCardProps {
  entry: ImageEntry;
  onRemove: (id: string) => void;
  onRunOcr: (id: string) => void;
  onCopyResult: (id: string) => void;
  onReviewEntry: (id: string) => void;
  onViewImage: (id: string) => void;
  copied: boolean;
}

function ImageCard({
  entry,
  onRemove,
  onRunOcr,
  onCopyResult,
  onReviewEntry,
  onViewImage,
  copied,
}: ImageCardProps) {
  return (
    <Card className="relative overflow-hidden">
      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 size-6 z-10 text-muted-foreground hover:text-foreground"
        onClick={() => onRemove(entry.id)}
        aria-label="Remove image"
      >
        <X className="size-3" />
      </Button>

      {/* Preview image */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        <img
          src={entry.previewUrl}
          alt={entry.file.name}
          className="w-full h-full object-cover"
        />

        {/* Status badges overlaid on the image */}
        {entry.status !== "idle" && (
          <div className="absolute top-1.5 left-1.5 flex gap-1">
            {entry.status === "done" && entry.confidence !== null && (
              <Badge variant={confidenceBadgeVariant(entry.confidence)} className="text-[10px] px-1.5 py-0">
                {entry.confidence.toFixed(0)}%
              </Badge>
            )}
            {entry.status === "done" && entry.saved && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-background/80">
                Saved
              </Badge>
            )}
            {entry.status === "loading" && (
              <Badge variant="secondary">Processing…</Badge>
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

        {/* View button — always visible so the image is always accessible */}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => onViewImage(entry.id)}
        >
          <Expand className="size-3" />
          {entry.preprocessedUrl ? "View / Compare" : "View Image"}
        </Button>

        {/* OCR result text */}
        {entry.status === "done" && entry.result && (
          <>
            <Separator />
            <ScrollArea className="h-32 w-full rounded-md">
              <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed p-1">
                {entry.result}
              </pre>
            </ScrollArea>

            {/* Action row: copy + review */}
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={() => onCopyResult(entry.id)}
              >
                {copied ? <Check className="size-3" /> : <Clipboard className="size-3" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                variant={entry.saved ? "outline" : "secondary"}
                size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={() => onReviewEntry(entry.id)}
              >
                <BookOpen className="size-3" />
                {entry.saved ? "Review again" : "Review & Save"}
              </Button>
            </div>
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

  // Review sheet state — which entry is open for review
  const [reviewEntryId, setReviewEntryId] = React.useState<string | null>(null);
  const reviewEntry = entries.find((e) => e.id === reviewEntryId) ?? null;

  // Lightbox state — which entry is open for full-size viewing
  const [lightboxEntryId, setLightboxEntryId] = React.useState<string | null>(null);
  const lightboxEntry = entries.find((e) => e.id === lightboxEntryId) ?? null;

  // Clean up object URLs when component unmounts to avoid memory leaks
  React.useEffect(() => {
    return () => {
      entries.forEach((e) => {
        URL.revokeObjectURL(e.previewUrl);
        if (e.preprocessedUrl) URL.revokeObjectURL(e.preprocessedUrl);
      });
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
      if (entry) {
        URL.revokeObjectURL(entry.previewUrl);
        // Also revoke the preprocessed blob URL to free canvas memory
        if (entry.preprocessedUrl) URL.revokeObjectURL(entry.preprocessedUrl);
      }
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
                preprocessedUrl: result.preprocessedUrl ?? null,
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
              }
            : e
        )
      );
    }
  }

  async function handleRunAll() {
    const runnableIds = entries
      .filter((e) => e.status === "idle" || e.status === "error")
      .map((e) => e.id);
    // Run sequentially to avoid saturating the Tesseract worker
    for (const id of runnableIds) {
      await handleRunOcr(id);
    }
  }

  function handleCopyResult(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry?.result) return;
    navigator.clipboard.writeText(entry.result);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleReviewEntry(id: string) {
    setReviewEntryId(id);
  }

  function handleEntrySaved(type: "day" | "week", _id: number) {
    // Mark the reviewed entry as saved
    if (reviewEntryId) {
      setEntries((prev) =>
        prev.map((e) => (e.id === reviewEntryId ? { ...e, saved: true } : e))
      );
    }
  }

  const hasEntries = entries.length > 0;
  const isAnyLoading = entries.some((e) => e.status === "loading");
  const hasRunnable = entries.some((e) => e.status === "idle" || e.status === "error");

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>New Entry</CardTitle>
          <CardDescription>
            Upload screenshots of your DoorDash earnings to extract and save them.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Dropzone — always visible so more images can be added */}
      <Dropzone onFiles={handleFiles} />

      {/* Bulk actions */}
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
                entries.forEach((e) => {
                  URL.revokeObjectURL(e.previewUrl);
                  if (e.preprocessedUrl) URL.revokeObjectURL(e.preprocessedUrl);
                });
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
              onReviewEntry={handleReviewEntry}
              onViewImage={(id) => setLightboxEntryId(id)}
              copied={copiedId === entry.id}
            />
          ))}
        </div>
      )}

       <EntryReviewModal
        open={reviewEntryId !== null}
        onOpenChange={(open) => { if (!open) setReviewEntryId(null); }}
        rawText={reviewEntry?.result ?? ""}
        ocrConfidence={reviewEntry?.confidence}
        onSaved={handleEntrySaved}
      />

      {/* Image Lightbox — full-size viewer with optional preprocessed comparison */}
      <ImageLightbox
        open={lightboxEntryId !== null}
        onOpenChange={(open) => { if (!open) setLightboxEntryId(null); }}
        originalUrl={lightboxEntry?.previewUrl ?? ""}
        preprocessedUrl={lightboxEntry?.preprocessedUrl ?? undefined}
        fileName={lightboxEntry?.file.name ?? ""}
        confidence={lightboxEntry?.confidence}
      />
    </div>
  );
}
