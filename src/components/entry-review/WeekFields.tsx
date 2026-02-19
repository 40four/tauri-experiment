// ---------------------------------------------------------------------------
// WeekFields
// Renders the editable fields for a Week entry inside the review sheet.
// Uses controlled inputs wired to the parent's WeekFormState.
// ---------------------------------------------------------------------------

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WeekFormState } from "./types";

interface WeekFieldsProps {
  state: WeekFormState;
  onChange: (next: WeekFormState) => void;
}

/** Generic helper to update one key of the form state */
function field<K extends keyof WeekFormState>(
  key: K,
  state: WeekFormState,
  onChange: (next: WeekFormState) => void
) {
  return (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...state, [key]: e.target.value });
}

export function WeekFields({ state, onChange }: WeekFieldsProps) {
  return (
    <div className="grid gap-4">
      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="week-date-start">Start Date</Label>
          <Input
            id="week-date-start"
            type="date"
            value={state.date_start}
            onChange={field("date_start", state, onChange)}
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="week-date-end">End Date</Label>
          <Input
            id="week-date-end"
            type="date"
            value={state.date_end}
            onChange={field("date_end", state, onChange)}
            placeholder="YYYY-MM-DD"
          />
        </div>
      </div>

      {/* Time fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="week-active-time">Active Time</Label>
          <Input
            id="week-active-time"
            value={state.active_time}
            onChange={field("active_time", state, onChange)}
            placeholder="e.g. 12h 30m"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="week-total-time">Total Time</Label>
          <Input
            id="week-total-time"
            value={state.total_time}
            onChange={field("total_time", state, onChange)}
            placeholder="e.g. 18h 45m"
          />
        </div>
      </div>

      {/* Deliveries */}
      <div className="space-y-1.5">
        <Label htmlFor="week-deliveries">Completed Deliveries</Label>
        <Input
          id="week-deliveries"
          type="number"
          min={0}
          value={state.completed_deliveries}
          onChange={field("completed_deliveries", state, onChange)}
          placeholder="e.g. 47"
        />
      </div>

      {/* Total earnings (informational, not persisted to weeks table) */}
      <div className="space-y-1.5">
        <Label htmlFor="week-earnings">
          Total Earnings{" "}
          <span className="text-muted-foreground text-xs font-normal">
            (informational)
          </span>
        </Label>
        <Input
          id="week-earnings"
          type="number"
          min={0}
          step={0.01}
          value={state.total_earnings}
          onChange={field("total_earnings", state, onChange)}
          placeholder="e.g. 234.56"
        />
      </div>
    </div>
  );
}
