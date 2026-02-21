// ---------------------------------------------------------------------------
// EntryReviewModal
// A centered Dialog modal for reviewing and saving OCR-parsed session entries.
// No tabs — sessions are the only entry type now.
//
// Architecture:
//   - Parses OCR text on open via parseOcrText()
//   - Converts ParsedSession → SessionFormState
//   - On save, converts form strings back to typed DB values and calls
//     saveSessionWithOffers()
// ---------------------------------------------------------------------------

import * as React from "react";
import { Save, AlertCircle, FileText } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  parseOcrText,
  formatMinutes,
  parseDurationString,
  type OcrParseResult,
} from "@/lib/ocrParser";
import { saveSessionWithOffers } from "@/services/entryService";
import { SessionFields } from "./SessionFields";
import type { SessionFormState, OfferFormRow } from "./types";

// ---------------------------------------------------------------------------
// Conversion helpers — ParsedSession → SessionFormState
// ---------------------------------------------------------------------------

function parsedSessionToFormState(parsed: OcrParseResult["session"]): SessionFormState {
  return {
    date: parsed?.date ?? "",
    total_earnings: parsed?.total_earnings?.toString() ?? "",
    base_pay: parsed?.base_pay?.toString() ?? "",
    tips: parsed?.tips?.toString() ?? "",
    start_time: parsed?.start_time ?? "",
    end_time: parsed?.end_time ?? "",
    active_time: formatMinutes(parsed?.active_time ?? null),
    total_time: formatMinutes(parsed?.total_time ?? null),
    offers_count: parsed?.offers_count?.toString() ?? "",
    deliveries: parsed?.deliveries?.toString() ?? "",
    offers: (parsed?.offers ?? []).map((o) => ({
      key: crypto.randomUUID(),
      store: o.store,
      total_earnings: o.total_earnings?.toString() ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers — SessionFormState → DB insert values
// ---------------------------------------------------------------------------

function toNullableFloat(s: string): number | null {
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

function toNullableInt(s: string): number | null {
  const v = parseInt(s, 10);
  return isNaN(v) ? null : v;
}

function toNullableString(s: string): string | null {
  return s.trim() === "" ? null : s.trim();
}

function formOffersToDB(offers: OfferFormRow[]) {
  return offers
    .filter((o) => o.store.trim() !== "")
    .map((o) => ({
      store: o.store.trim(),
      total_earnings: toNullableFloat(o.total_earnings),
    }));
}

// ---------------------------------------------------------------------------
// Sub-component: confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ score }: { score: number }) {
  const variant =
    score >= 80 ? "default" : score >= 60 ? "secondary" : "destructive";
  return <Badge variant={variant}>{score.toFixed(0)}% confidence</Badge>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EntryReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Raw OCR text to pre-populate the form */
  rawText: string;
  /** Tesseract confidence score if available */
  ocrConfidence?: number | null;
  /** Called with the new session id after a successful save */
  onSaved?: (id: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntryReviewModal({
  open,
  onOpenChange,
  rawText,
  ocrConfidence,
  onSaved,
}: EntryReviewModalProps) {
  // Parse OCR once when the modal opens (or rawText changes)
  const parsed = React.useMemo(() => parseOcrText(rawText), [rawText]);

  // Form state — re-initialized when parsed changes (new image reviewed)
  const [formState, setFormState] = React.useState<SessionFormState>(
    () => parsedSessionToFormState(parsed.session)
  );

  React.useEffect(() => {
    setFormState(parsedSessionToFormState(parsed.session));
  }, [parsed]);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const sessionId = await saveSessionWithOffers(
        {
          date:
            toNullableString(formState.date) ??
            new Date().toISOString().slice(0, 10),
          total_earnings: toNullableFloat(formState.total_earnings),
          base_pay: toNullableFloat(formState.base_pay),
          tips: toNullableFloat(formState.tips),
          start_time: toNullableString(formState.start_time),
          end_time: toNullableString(formState.end_time),
          active_time: parseDurationString(formState.active_time),
          total_time: parseDurationString(formState.total_time),
          offers_count: toNullableInt(formState.offers_count),
          deliveries: toNullableInt(formState.deliveries),
        },
        formOffersToDB(formState.offers)
      );
      onSaved?.(sessionId);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save session");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        max-w-2xl gives the form comfortable two-column space.
        h-[90vh] + flex lets the footer stay pinned while content scrolls.
      */}
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="size-4 text-muted-foreground" />
            <DialogTitle>Review Session</DialogTitle>
            {ocrConfidence != null && (
              <ConfidenceBadge score={ocrConfidence} />
            )}
          </div>
          <DialogDescription>
            Verify and correct the fields extracted from the screenshot, then save.
          </DialogDescription>
        </DialogHeader>

        <Separator className="shrink-0" />

        {/* Scrollable form */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4">
            <SessionFields state={formState} onChange={setFormState} />
          </div>
        </ScrollArea>

        <Separator className="shrink-0" />

        {/* Pinned footer */}
        <DialogFooter className="px-6 py-4 shrink-0 flex-col gap-2">
          {saveError && (
            <Alert variant="destructive" className="w-full">
              <AlertCircle className="size-4" />
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 justify-end w-full">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="size-4" />
              {saving ? "Saving…" : "Save Session"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
