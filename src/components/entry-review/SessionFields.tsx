// ---------------------------------------------------------------------------
// SessionFields
// Renders the editable fields for a Session entry inside the review modal,
// including the nested OffersFields sub-component.
// ---------------------------------------------------------------------------

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { OffersFields } from "./OffersFields";
import type { SessionFormState } from "./types";

interface SessionFieldsProps {
  state: SessionFormState;
  onChange: (next: SessionFormState) => void;
}

/** Generic helper to update one key of the form state */
function field<K extends keyof SessionFormState>(
  key: K,
  state: SessionFormState,
  onChange: (next: SessionFormState) => void
) {
  return (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...state, [key]: e.target.value });
}

/** Reusable dollar-prefixed number input */
function CurrencyInput({
  id,
  value,
  onChange,
  placeholder = "0.00",
}: {
  id: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
        $
      </span>
      <Input
        id={id}
        className="pl-6"
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}

/**
 * Collapsible earnings breakdown — base pay + tips sub-fields of total earnings.
 * Starts open when OCR detected values; closed otherwise so the form stays compact.
 */
function EarningsBreakdown({
  state,
  onChange,
  detected,
}: {
  state: SessionFormState;
  onChange: (next: SessionFormState) => void;
  detected: boolean;
}) {
  const [open, setOpen] = React.useState(detected);

  return (
    <div className="ml-3 border-l-2 border-border pl-3 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {/* Chevron rotates when open */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`size-3 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        Earnings breakdown
        {!detected && (
          <span className="opacity-60">— not detected in screenshot</span>
        )}
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="session-base-pay" className="text-xs">Base Pay</Label>
            <CurrencyInput
              id="session-base-pay"
              value={state.base_pay}
              onChange={(e) => onChange({ ...state, base_pay: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="session-tips" className="text-xs">Tips</Label>
            <CurrencyInput
              id="session-tips"
              value={state.tips}
              onChange={(e) => onChange({ ...state, tips: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SessionFields({ state, onChange }: SessionFieldsProps) {
  // Start breakdown expanded if OCR detected either value
  const hasBreakdown = state.base_pay !== "" || state.tips !== "";

  return (
    <div className="grid gap-4">
      {/* Date */}
      <div className="space-y-1.5">
        <Label htmlFor="session-date">Date</Label>
        <Input
          id="session-date"
          type="date"
          value={state.date}
          onChange={field("date", state, onChange)}
        />
      </div>

      {/* Total earnings + collapsible breakdown */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="session-earnings">Total Earnings</Label>
          <CurrencyInput
            id="session-earnings"
            value={state.total_earnings}
            onChange={field("total_earnings", state, onChange)}
          />
        </div>
        <EarningsBreakdown state={state} onChange={onChange} detected={hasBreakdown} />
      </div>

      {/* Time range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="session-start-time">Start Time</Label>
          <Input
            id="session-start-time"
            type="time"
            value={state.start_time}
            onChange={field("start_time", state, onChange)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="session-end-time">End Time</Label>
          <Input
            id="session-end-time"
            type="time"
            value={state.end_time}
            onChange={field("end_time", state, onChange)}
          />
        </div>
      </div>

      {/* Active / Dash time */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="session-active-time">Active Time</Label>
          <Input
            id="session-active-time"
            value={state.active_time}
            onChange={field("active_time", state, onChange)}
            placeholder="e.g. 1h 30m"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="session-total-time">Dash Time</Label>
          <Input
            id="session-total-time"
            value={state.total_time}
            onChange={field("total_time", state, onChange)}
            placeholder="e.g. 1h 44m"
          />
        </div>
      </div>

      {/* Offers count + Deliveries — side by side since they're related counts */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="session-offers-count">Offers</Label>
          <Input
            id="session-offers-count"
            type="number"
            min={0}
            value={state.offers_count}
            onChange={field("offers_count", state, onChange)}
            placeholder="e.g. 5"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="session-deliveries">Deliveries</Label>
          <Input
            id="session-deliveries"
            type="number"
            min={0}
            value={state.deliveries}
            onChange={field("deliveries", state, onChange)}
            placeholder="e.g. 5"
          />
        </div>
      </div>

      <Separator />

      {/* Individual offer line items */}
      <OffersFields
        offers={state.offers}
        onChange={(offers) => onChange({ ...state, offers })}
      />
    </div>
  );
}
