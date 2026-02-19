// ---------------------------------------------------------------------------
// DayFields
// Renders the editable fields for a Day entry inside the review sheet,
// including the nested OffersFields sub-component.
// ---------------------------------------------------------------------------

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { OffersFields } from "./OffersFields";
import type { DayFormState } from "./types";

interface DayFieldsProps {
  state: DayFormState;
  onChange: (next: DayFormState) => void;
}

/** Generic helper to update one key of the form state */
function field<K extends keyof DayFormState>(
  key: K,
  state: DayFormState,
  onChange: (next: DayFormState) => void
) {
  return (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...state, [key]: e.target.value });
}

export function DayFields({ state, onChange }: DayFieldsProps) {
  return (
    <div className="grid gap-4">
      {/* Date */}
      <div className="space-y-1.5">
        <Label htmlFor="day-date">Date</Label>
        <Input
          id="day-date"
          type="date"
          value={state.date}
          onChange={field("date", state, onChange)}
        />
      </div>

      {/* Earnings */}
      <div className="space-y-1.5">
        <Label htmlFor="day-earnings">Total Earnings</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            $
          </span>
          <Input
            id="day-earnings"
            className="pl-6"
            type="number"
            min={0}
            step={0.01}
            value={state.total_earnings}
            onChange={field("total_earnings", state, onChange)}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Time range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="day-start-time">Start Time</Label>
          <Input
            id="day-start-time"
            type="time"
            value={state.start_time}
            onChange={field("start_time", state, onChange)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="day-end-time">End Time</Label>
          <Input
            id="day-end-time"
            type="time"
            value={state.end_time}
            onChange={field("end_time", state, onChange)}
          />
        </div>
      </div>

      {/* Active / Total time */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="day-active-time">Active Time</Label>
          <Input
            id="day-active-time"
            value={state.active_time}
            onChange={field("active_time", state, onChange)}
            placeholder="e.g. 3h 20m"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="day-total-time">Total Time</Label>
          <Input
            id="day-total-time"
            value={state.total_time}
            onChange={field("total_time", state, onChange)}
            placeholder="e.g. 5h 15m"
          />
        </div>
      </div>

      {/* Deliveries */}
      <div className="space-y-1.5">
        <Label htmlFor="day-deliveries">Deliveries</Label>
        <Input
          id="day-deliveries"
          type="number"
          min={0}
          value={state.deliveries}
          onChange={field("deliveries", state, onChange)}
          placeholder="e.g. 8"
        />
      </div>

      <Separator />

      {/* Offers */}
      <OffersFields
        offers={state.offers}
        onChange={(offers) => onChange({ ...state, offers })}
      />
    </div>
  );
}
