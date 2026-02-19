// ---------------------------------------------------------------------------
// EntryReviewSheet
// A Shadcn Sheet that slides in from the right after OCR completes.
// Pre-populates form fields from the parsed OCR result and lets the user
// edit before saving to the DB.
//
// Architecture:
//   - Parses OCR text on open via parseOcrText()
//   - Converts ParsedDay / ParsedWeek → DayFormState / WeekFormState
//   - Shows Tabs for "Day" vs "Week" — OCR detection pre-selects the tab
//   - On save, converts form strings back to typed DB values and calls the
//     appropriate service functions
// ---------------------------------------------------------------------------

import * as React from "react";
import { Save, AlertCircle } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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

function parsedDayToFormState(
  parsed: OcrParseResult["day"]
): DayFormState {
  return {
    date: parsed?.date ?? "",
    total_earnings: parsed?.total_earnings?.toString() ?? "",
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

function parsedWeekToFormState(
  parsed: OcrParseResult["week"]
): WeekFormState {
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
// Conversion helpers — FormState → DB insert values
// ---------------------------------------------------------------------------

function toNullableInt(s: string): number | null {
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function toNullableFloat(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function toNullableString(s: string): string | null {
  return s.trim() || null;
}

function formOffersToDB(
  offers: OfferFormRow[]
): { store: string | null; total_earnings: number | null }[] {
  return offers
    .filter((r) => r.store.trim() || r.total_earnings.trim())
    .map((r) => ({
      store: toNullableString(r.store),
      total_earnings: toNullableFloat(r.total_earnings),
    }));
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const variant =
    score >= 80 ? "default" : score >= 50 ? "secondary" : "destructive";
  return <Badge variant={variant}>{score.toFixed(0)}% confidence</Badge>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EntryReviewSheetProps {
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

export function EntryReviewSheet({
  open,
  onOpenChange,
  rawText,
  ocrConfidence,
  onSaved,
}: EntryReviewSheetProps) {
  // Parse OCR once when the sheet opens (or rawText changes)
  const parsed = React.useMemo(
    () => parseOcrText(rawText),
    [rawText]
  );

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
          date: toNullableString(dayState.date) ?? new Date().toISOString().slice(0, 10),
          total_earnings: toNullableFloat(dayState.total_earnings),
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
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWeek() {
    setSaving(true);
    setSaveError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const weekId = await WeekService.create({
        date_start: toNullableString(weekState.date_start) ?? today,
        date_end: toNullableString(weekState.date_end) ?? today,
        active_time: parseDurationString(weekState.active_time),
        total_time: parseDurationString(weekState.total_time),
        completed_deliveries: toNullableInt(weekState.completed_deliveries),
      });
      onSaved?.("week", weekId);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg" side="right">
        {/* Header */}
        <SheetHeader className="space-y-1 pr-2">
          <div className="flex items-center gap-2">
            <SheetTitle>Review Entry</SheetTitle>
            <ConfidenceBadge score={ocrConfidence ?? null} />
            {parsed.type !== "unknown" && (
              <Badge variant="outline" className="capitalize">
                {parsed.type} detected
              </Badge>
            )}
          </div>
          <SheetDescription>
            Fields pre-filled from OCR — edit as needed before saving.
          </SheetDescription>
        </SheetHeader>

        <Separator />

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "day" | "week")}
          className="flex flex-col flex-1 min-h-0"
        >
          <TabsList className="w-full">
            <TabsTrigger value="day" className="flex-1">
              Day Entry
            </TabsTrigger>
            <TabsTrigger value="week" className="flex-1">
              Week Entry
            </TabsTrigger>
          </TabsList>

          {/* Day tab */}
          <TabsContent value="day" className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-1">
              <div className="py-4">
                <DayFields state={dayState} onChange={setDayState} />
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Week tab */}
          <TabsContent value="week" className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-1">
              <div className="py-4">
                <WeekFields state={weekState} onChange={setWeekState} />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Error message */}
        {saveError && (
          <div className="flex items-center gap-2 text-destructive text-sm px-1">
            <AlertCircle className="size-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Footer */}
        <SheetFooter className="pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={activeTab === "day" ? handleSaveDay : handleSaveWeek}
            disabled={saving}
            className="flex-1 gap-1.5"
          >
            <Save className="size-4" />
            {saving ? "Saving…" : `Save ${activeTab}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
