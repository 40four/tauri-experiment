// ---------------------------------------------------------------------------
// OffersFields
// Renders an editable list of offer rows (store + earnings).
// Supports adding new blank rows and removing existing ones.
// ---------------------------------------------------------------------------

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { OfferFormRow } from "./types";

interface OffersFieldsProps {
  offers: OfferFormRow[];
  onChange: (offers: OfferFormRow[]) => void;
}

function newOfferRow(): OfferFormRow {
  return { key: crypto.randomUUID(), store: "", total_earnings: "" };
}

export function OffersFields({ offers, onChange }: OffersFieldsProps) {
  /** Update a single field on a specific row by key */
  function updateRow(key: string, patch: Partial<OfferFormRow>) {
    onChange(offers.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    onChange(offers.filter((row) => row.key !== key));
  }

  function addRow() {
    onChange([...offers, newOfferRow()]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Offers</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={addRow}
        >
          <Plus className="size-3" />
          Add offer
        </Button>
      </div>

      {offers.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No offers detected — add them manually if needed.
        </p>
      )}

      {offers.map((row, idx) => (
        <React.Fragment key={row.key}>
          {idx > 0 && <Separator />}
          <div className="flex items-center gap-2">
            {/* Store name */}
            <Input
              className="flex-1"
              value={row.store}
              onChange={(e) => updateRow(row.key, { store: e.target.value })}
              placeholder="Store name"
              aria-label={`Offer ${idx + 1} store`}
            />
            {/* Earnings */}
            <div className="relative w-28">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                $
              </span>
              <Input
                className="pl-6"
                type="number"
                min={0}
                step={0.01}
                value={row.total_earnings}
                onChange={(e) => updateRow(row.key, { total_earnings: e.target.value })}
                placeholder="0.00"
                aria-label={`Offer ${idx + 1} earnings`}
              />
            </div>
            {/* Remove */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 size-8 text-muted-foreground hover:text-destructive"
              onClick={() => removeRow(row.key)}
              aria-label="Remove offer"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
