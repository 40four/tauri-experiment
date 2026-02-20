// ---------------------------------------------------------------------------
// ImageLightbox.tsx
// Full-size image viewer with optional side-by-side preprocessing comparison.
//
// View modes:
//   "original"    — raw uploaded image at full size
//   "processed"   — preprocessed (grayscale/binarized) version
//   "compare"     — both images side by side with a labeled split layout
//
// The "processed" and "compare" modes are only available once OCR has run
// and a preprocessedUrl exists on the entry.
// ---------------------------------------------------------------------------

import * as React from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = "original" | "processed" | "compare";

export interface ImageLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Original image object URL */
  originalUrl: string;
  /** Preprocessed image object URL — undefined until OCR has run */
  preprocessedUrl?: string;
  /** Display name shown in the dialog header */
  fileName: string;
  /** Tesseract confidence score if available */
  confidence?: number | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ImagePaneProps {
  src: string;
  label: string;
  /** Extra classes for the outer wrapper */
  className?: string;
  zoom: number;
}

/** A single scrollable image pane with a floating label badge. */
function ImagePane({ src, label, className = "", zoom }: ImagePaneProps) {
  return (
    <div className={`relative flex flex-col gap-1 ${className}`}>
      {/* Floating label */}
      <Badge variant="secondary" className="self-start text-xs">
        {label}
      </Badge>

      {/* Scrollable image area */}
      <ScrollArea className="flex-1 rounded-md border bg-muted/30 overflow-hidden">
        <div className="flex items-start justify-center min-h-full p-2">
          <img
            src={src}
            alt={label}
            style={{ width: `${zoom}%`, maxWidth: "none" }}
            className="rounded transition-[width] duration-150 object-contain"
            draggable={false}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageLightbox({
  open,
  onOpenChange,
  originalUrl,
  preprocessedUrl,
  fileName,
  confidence,
}: ImageLightboxProps) {
  // Default to compare if preprocessed is available, otherwise original
  const [mode, setMode] = React.useState<ViewMode>(() =>
    preprocessedUrl ? "compare" : "original"
  );
  const [zoom, setZoom] = React.useState(100);

  // When the dialog opens, reset to a sensible default mode
  React.useEffect(() => {
    if (open) {
      setMode(preprocessedUrl ? "compare" : "original");
      setZoom(100);
    }
  }, [open, preprocessedUrl]);

  // Zoom helpers
  const zoomIn  = () => setZoom((z) => Math.min(z + 25, 300));
  const zoomOut = () => setZoom((z) => Math.max(z - 25, 25));
  const zoomReset = () => setZoom(100);

  const hasProcessed = Boolean(preprocessedUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Wide dialog — nearly full viewport, tall enough to show phone screenshots
        className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col gap-3 p-4"
        // Suppress the default close button; we render our own in the header
        hideCloseButton
      >
        {/* ---- Header --------------------------------------------------- */}
        <DialogHeader className="flex-none">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <DialogTitle className="text-sm font-medium truncate">
                {fileName}
              </DialogTitle>
              {confidence !== null && confidence !== undefined && (
                <Badge
                  variant={
                    confidence >= 80
                      ? "default"
                      : confidence >= 50
                      ? "secondary"
                      : "destructive"
                  }
                  className="text-xs shrink-0"
                >
                  {confidence.toFixed(0)}% confidence
                </Badge>
              )}
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2 shrink-0">
              {/* View mode toggle */}
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && setMode(v as ViewMode)}
                size="sm"
                className="h-7"
              >
                <ToggleGroupItem value="original" className="text-xs px-2 h-7">
                  Original
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="processed"
                  disabled={!hasProcessed}
                  className="text-xs px-2 h-7"
                >
                  Processed
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="compare"
                  disabled={!hasProcessed}
                  className="text-xs px-2 h-7"
                >
                  Compare
                </ToggleGroupItem>
              </ToggleGroup>

              {/* Zoom controls */}
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="size-7" onClick={zoomOut} aria-label="Zoom out">
                  <ZoomOut className="size-3.5" />
                </Button>
                <button
                  onClick={zoomReset}
                  className="text-xs text-muted-foreground hover:text-foreground tabular-nums w-10 text-center"
                  aria-label="Reset zoom"
                >
                  {zoom}%
                </button>
                <Button variant="ghost" size="icon" className="size-7" onClick={zoomIn} aria-label="Zoom in">
                  <ZoomIn className="size-3.5" />
                </Button>
              </div>

              {/* Close */}
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ---- Image area ----------------------------------------------- */}
        <div
          className={`flex-1 min-h-0 ${
            mode === "compare" ? "grid grid-cols-2 gap-3" : "flex flex-col"
          }`}
        >
          {/* Original — shown in "original" and "compare" modes */}
          {(mode === "original" || mode === "compare") && (
            <ImagePane
              src={originalUrl}
              label="Original"
              className="flex-1 min-h-0"
              zoom={zoom}
            />
          )}

          {/* Processed — shown in "processed" and "compare" modes */}
          {hasProcessed && preprocessedUrl && (mode === "processed" || mode === "compare") && (
            <ImagePane
              src={preprocessedUrl}
              label="Preprocessed"
              className="flex-1 min-h-0"
              zoom={zoom}
            />
          )}

          {/* Placeholder when preprocessed isn't available yet */}
          {!hasProcessed && mode !== "original" && (
            <div className="flex-1 flex items-center justify-center rounded-md border border-dashed bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Run OCR first to see the preprocessed version
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
