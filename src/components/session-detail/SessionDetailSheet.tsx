// ---------------------------------------------------------------------------
// SessionDetailSheet
// Slide-in Sheet panel showing full session details with inline editing.
//
// Architecture:
//   - Opened from the Data page table when a row is clicked
//   - Loads session + offers on open (passed in as props to avoid re-fetch)
//   - Edit mode toggles the display values into the existing SessionFields
//     form components so we get the same UX as the EntryReviewModal for free
//   - On save: calls SessionService.update + replaces offers via
//     deleteBySessionId → bulkCreate (simplest correct approach)
//   - Fires onUpdate(updatedSession) so the parent table row refreshes
//     without a full re-fetch
// ---------------------------------------------------------------------------

import * as React from "react";
import { Pencil, Save, X, Trash2, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { formatMinutes, parseDurationString } from "@/lib/ocrParser";
import { SessionService, OfferService } from "@/services/entryService";
import { SessionFields } from "@/components/entry-review/SessionFields";
import type { SessionFormState } from "@/components/entry-review/entry-review-types";
import type { Session, Offer, SessionInsert } from "@/types/entries";

// ---------------------------------------------------------------------------
// Helpers — Session DB row ↔ SessionFormState
// These mirror the conversions in EntryReviewModal so the form fields behave
// identically whether you're reviewing a new OCR scan or editing an old one.
// ---------------------------------------------------------------------------

function sessionToFormState(session: Session, offers: Offer[]): SessionFormState {
  return {
    date:           session.date ?? "",
    total_earnings: session.total_earnings?.toString() ?? "",
    base_pay:       session.base_pay?.toString() ?? "",
    tips:           session.tips?.toString() ?? "",
    start_time:     session.start_time ?? "",
    end_time:       session.end_time ?? "",
    active_time:    formatMinutes(session.active_time),
    total_time:     formatMinutes(session.total_time),
    offers_count:   session.offers_count?.toString() ?? "",
    deliveries:     session.deliveries?.toString() ?? "",
    offers: offers.map((o) => ({
      key:            o.id.toString(),
      store:          o.store ?? "",
      total_earnings: o.total_earnings?.toString() ?? "",
    })),
  };
}

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

function formStateToSessionInsert(f: SessionFormState): SessionInsert {
  return {
    date:           f.date || new Date().toISOString().slice(0, 10),
    total_earnings: toNullableFloat(f.total_earnings),
    base_pay:       toNullableFloat(f.base_pay),
    tips:           toNullableFloat(f.tips),
    start_time:     toNullableString(f.start_time),
    end_time:       toNullableString(f.end_time),
    active_time:    parseDurationString(f.active_time),
    total_time:     parseDurationString(f.total_time),
    offers_count:   toNullableInt(f.offers_count),
    deliveries:     toNullableInt(f.deliveries),
  };
}

// ---------------------------------------------------------------------------
// Sub-component: ReadOnlyField
// Used in view mode — compact label + value pair.
// ---------------------------------------------------------------------------

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SessionDetailSheetProps {
  session: Session | null;
  offers: Offer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save so the parent can update its local state */
  onUpdate: (updatedSession: Session) => void;
  /** Called after a successful delete so the parent can remove the row */
  onDelete: (sessionId: number) => void;
}

// ---------------------------------------------------------------------------
// SessionDetailSheet
// ---------------------------------------------------------------------------

export function SessionDetailSheet({
  session,
  offers,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
}: SessionDetailSheetProps) {
  const [editing, setEditing]       = React.useState(false);
  const [formState, setFormState]   = React.useState<SessionFormState | null>(null);
  const [saving, setSaving]         = React.useState(false);
  const [saveError, setSaveError]   = React.useState<string | null>(null);

  // Reset edit state when the sheet opens with a new session
  React.useEffect(() => {
    if (open && session) {
      setFormState(sessionToFormState(session, offers));
      setEditing(false);
      setSaveError(null);
    }
  }, [open, session, offers]);

  if (!session) return null;

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!formState) return;
    setSaving(true);
    setSaveError(null);

    try {
      const insertData = formStateToSessionInsert(formState);

      // Update the session row
      await SessionService.update(session.id, insertData);

      // Replace all offers atomically: delete existing, bulk-insert new set
      await OfferService.deleteBySessionId(session.id);
      const offerRows = formState.offers
        .filter((o) => o.store.trim() || o.total_earnings.trim())
        .map((o) => ({
          store:          o.store.trim() || null,
          total_earnings: toNullableFloat(o.total_earnings),
        }));
      if (offerRows.length > 0) {
        await OfferService.bulkCreate(session.id, offerRows);
      }

      // Build an optimistic updated session object so the parent table
      // refreshes immediately without a round-trip
      const updatedSession: Session = {
        ...session,
        ...insertData,
      };

      onUpdate(updatedSession);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete handler
  // ---------------------------------------------------------------------------

  async function handleDelete() {
    try {
      await SessionService.delete(session.id);
      onDelete(session.id);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to delete session.");
    }
  }

  // ---------------------------------------------------------------------------
  // Derived display values (view mode only)
  // ---------------------------------------------------------------------------

  const fmt$ = (v: number | null) => (v !== null ? `$${v.toFixed(2)}` : "—");
  const fmtTime = (v: string | null) => v ?? "—";
  const fmtMin = (v: number | null) => (v !== null ? formatMinutes(v) : "—");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">

        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle>
                {format(parseISO(session.date), "EEEE, MMMM d, yyyy")}
              </SheetTitle>
              <SheetDescription className="mt-1">
                Session #{session.id}
                {session.start_time && session.end_time && (
                  <> · {session.start_time} – {session.end_time}</>
                )}
              </SheetDescription>
            </div>
            {/* Earnings badge in header for quick glance */}
            {session.total_earnings !== null && (
              <Badge variant="secondary" className="text-base font-bold px-3 py-1">
                {fmt$(session.total_earnings)}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Separator className="shrink-0" />

        {/* Scrollable body — view or edit mode */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4">

            {editing && formState ? (
              // ── Edit mode: reuse the existing SessionFields form component ──
              <SessionFields state={formState} onChange={setFormState} />
            ) : (
              // ── View mode: compact read-only grid ──────────────────────────
              <div className="space-y-6">

                {/* Earnings */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Earnings</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <ReadOnlyField label="Total"    value={fmt$(session.total_earnings)} />
                    <ReadOnlyField label="Base Pay" value={fmt$(session.base_pay)} />
                    <ReadOnlyField label="Tips"     value={fmt$(session.tips)} />
                  </div>
                </div>

                <Separator />

                {/* Time */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Time</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <ReadOnlyField label="Start"       value={fmtTime(session.start_time)} />
                    <ReadOnlyField label="End"         value={fmtTime(session.end_time)} />
                    <ReadOnlyField label="Active Time" value={fmtMin(session.active_time)} />
                    <ReadOnlyField label="Total Time"  value={fmtMin(session.total_time)} />
                  </div>
                </div>

                <Separator />

                {/* Activity */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Activity</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <ReadOnlyField label="Deliveries"  value={session.deliveries?.toString()} />
                    <ReadOnlyField label="Offers Seen" value={session.offers_count?.toString()} />
                  </div>
                </div>

                {/* Offers list */}
                {offers.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-semibold mb-3">
                        Offers ({offers.length})
                      </h3>
                      <div className="space-y-2">
                        {offers.map((offer) => (
                          <div
                            key={offer.id}
                            className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                          >
                            <span className="text-sm">
                              {offer.store ?? "Unknown store"}
                            </span>
                            <span className="text-sm font-medium tabular-nums">
                              {fmt$(offer.total_earnings)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

              </div>
            )}

            {/* Error alert */}
            {saveError && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="size-4" />
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}

          </div>
        </ScrollArea>

        <Separator className="shrink-0" />

        {/* Footer actions */}
        <div className="px-6 py-4 shrink-0 flex items-center justify-between gap-2">

          {/* Delete — wrapped in confirmation dialog */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={saving}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the session and all associated offers.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Edit / Save / Cancel */}
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Reset form to original values on cancel
                    setFormState(sessionToFormState(session, offers));
                    setEditing(false);
                    setSaveError(null);
                  }}
                  disabled={saving}
                >
                  <X className="size-4 mr-1.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-1.5"
                >
                  <Save className="size-4" />
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="gap-1.5"
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
