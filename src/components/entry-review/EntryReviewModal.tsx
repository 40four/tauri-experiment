// ---------------------------------------------------------------------------
// EntryReviewModal
// A centered Dialog modal for reviewing and saving OCR-parsed entries.
// Replaces the previous right-side Sheet (EntryReviewSheet) for improved
// readability and form ergonomics — a modal keeps focus, centers the content,
// and provides more horizontal space for two-column field layouts.
//
// Architecture:
//   - Parses OCR text on open via parseOcrText()
//   - Converts ParsedDay / ParsedWeek → DayFormState / WeekFormState
//   - Shows Tabs for "Day" vs "Week" — OCR detection pre-selects the tab
//   - On save, converts form strings back to typed DB values and calls the
//     appropriate service functions
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { WeekService, saveDayWithOffers } from "@/services/entryService";
import { WeekFields } from "./WeekFields";
import { DayFields } from "./DayFields";
import type { DayFormState, WeekFormState, OfferFormRow } from "./types";

// ---------------------------------------------------------------------------
// Conversion helpers — ParsedX → FormState
// ---------------------------------------------------------------------------

function parsedDayToFormState(parsed: OcrParseResult["day"]): DayFormState {
  return {
    date: parsed?.date ?? "",
    total_earnings: parsed?.total_earnings?.toString() ?? "",
    base_pay: parsed?.base_pay?.toString() ?? "",
    tips: parsed?.tips?.toString() ?? "",
    start_time: parsed?.start_time ?? "",
    end_time: parsed?.end_time ?? "",
    active_time: formatMinutes(parsed?.active_time ?? null),
    total_time: formatMinutes(parsed?.total_time ?? null),
    deliveries: parsed?.deliveries?.toString() ?? "",
    offers: (parsed?.offers ?? []).map((o) => ({
      key: crypto.randomUUID(),
      store: o.store,
      total_earnings: o.total_earnings?.toString() ?? "",
    })),
  };
}

function parsedWeekToFormState(parsed: OcrParseResult["week"]): WeekFormState {
  return {
    date_start: parsed?.date_start ?? "",
    date_end: parsed?.date_end ?? "",
    active_time: formatMinutes(parsed?.active_time ?? null),
    total_time: formatMinutes(parsed?.total_time ?? null),
    completed_deliveries: parsed?.completed_deliveries?.toString() ?? "",
    total_earnings: parsed?.total_earnings?.toString() ?? "",
  };
}

// ---------------------------------------------------------------------------
// Helpers — FormState → DB types
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
// Sub-component: detection badge
// ---------------------------------------------------------------------------

function DetectionBadge({ type }: { type: OcrParseResult["type"] }) {
  if (type === "unknown") return null;
  return (
    <Badge variant="outline" className="capitalize">
      {type} detected
    </Badge>
  );
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
  /** Called with the new day/week id after a successful save */
  onSaved?: (type: "day" | "week", id: number) => void;
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

  // Active tab — auto-selected from OCR detection
  const [activeTab, setActiveTab] = React.useState<"day" | "week">(
    parsed.type === "week" ? "week" : "day"
  );

  // Form state for each tab — re-initialized when parsed changes
  const [dayState, setDayState] = React.useState<DayFormState>(
    () => parsedDayToFormState(parsed.day)
  );
  const [weekState, setWeekState] = React.useState<WeekFormState>(
    () => parsedWeekToFormState(parsed.week)
  );

  // Re-populate when OCR result changes (new image reviewed)
  React.useEffect(() => {
    setDayState(parsedDayToFormState(parsed.day));
    setWeekState(parsedWeekToFormState(parsed.week));
    setActiveTab(parsed.type === "week" ? "week" : "day");
  }, [parsed]);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Save handlers
  // ---------------------------------------------------------------------------

  async function handleSaveDay() {
    setSaving(true);
    setSaveError(null);
    try {
      const dayId = await saveDayWithOffers(
        {
          week_id: null,
          date:
            toNullableString(dayState.date) ??
            new Date().toISOString().slice(0, 10),
          total_earnings: toNullableFloat(dayState.total_earnings),
          base_pay: toNullableFloat(dayState.base_pay),
          tips: toNullableFloat(dayState.tips),
          start_time: toNullableString(dayState.start_time),
          end_time: toNullableString(dayState.end_time),
          active_time: parseDurationString(dayState.active_time),
          total_time: parseDurationString(dayState.total_time),
          deliveries: toNullableInt(dayState.deliveries),
        },
        formOffersToDB(dayState.offers)
      );
      onSaved?.("day", dayId);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save day entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWeek() {
    setSaving(true);
    setSaveError(null);
    try {
      const weekId = await WeekService.create({
        date_start:
          toNullableString(weekState.date_start) ??
          new Date().toISOString().slice(0, 10),
        date_end: toNullableString(weekState.date_end),
        active_time: parseDurationString(weekState.active_time),
        total_time: parseDurationString(weekState.total_time),
        completed_deliveries: toNullableInt(weekState.completed_deliveries),
        total_earnings: toNullableFloat(weekState.total_earnings),
      });
      onSaved?.("week", weekId);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save week entry");
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
        The h-[90vh] + flex layout lets the footer stay pinned while the
        form content scrolls — important for entries with many offers.
      */}
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="size-4 text-muted-foreground" />
            <DialogTitle>Review Entry</DialogTitle>
            <div className="flex gap-1.5 ml-auto">
              <DetectionBadge type={parsed.type} />
              {ocrConfidence != null && (
                <ConfidenceBadge score={ocrConfidence} />
              )}
            </div>
          </div>
          <DialogDescription>
            Verify and correct the fields extracted from the screenshot, then
            save.
          </DialogDescription>
        </DialogHeader>

        <Separator className="shrink-0" />

        {/* Tabs + scrollable form area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "day" | "week")}
            className="h-full flex flex-col"
          >
            {/* Tab triggers */}
            <div className="px-6 pt-4 pb-2 shrink-0">
              <TabsList className="w-full">
                <TabsTrigger value="day" className="flex-1">
                  Day
                </TabsTrigger>
                <TabsTrigger value="week" className="flex-1">
                  Week
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable tab content */}
            <ScrollArea className="flex-1 min-h-0">
              <TabsContent value="day" className="px-6 pb-6 mt-0">
                <DayFields state={dayState} onChange={setDayState} />
              </TabsContent>
              <TabsContent value="week" className="px-6 pb-6 mt-0">
                <WeekFields state={weekState} onChange={setWeekState} />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        <Separator className="shrink-0" />

        {/* Footer — pinned to the bottom, outside the scroll area */}
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
            <Button
              onClick={activeTab === "day" ? handleSaveDay : handleSaveWeek}
              disabled={saving}
              className="gap-1.5"
            >
              <Save className="size-4" />
              {saving ? "Saving…" : `Save ${activeTab === "day" ? "Day" : "Week"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
