// ---------------------------------------------------------------------------
// Data Page
// Displays all sessions from the SQLite DB with expandable offer rows.
// Filtering: text search (date / store names), date-range presets + custom.
// Export: streams filtered sessions + their offers to a CSV download.
// ---------------------------------------------------------------------------

import * as React from "react";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { format, startOfWeek, startOfMonth, startOfYear, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { SessionService, OfferService } from "@/services/entryService";
import type { Session, Offer } from "@/types/entries";

// ---------------------------------------------------------------------------
// Date Range Utilities
// ---------------------------------------------------------------------------

type DateRangePreset = "today" | "week" | "month" | "year" | "custom";

function getPresetDateRange(preset: DateRangePreset): { from: Date; to: Date } | null {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: new Date(now.setHours(0, 0, 0, 0)), to: new Date() };
    case "week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: new Date() };
    case "month":
      return { from: startOfMonth(now), to: new Date() };
    case "year":
      return { from: startOfYear(now), to: new Date() };
    case "custom":
      return null;
  }
}

// ---------------------------------------------------------------------------
// CSV Export Helper
// Builds a CSV string from sessions + lazily-fetched offers, then triggers
// a browser download. Called after the user clicks "Export CSV".
// ---------------------------------------------------------------------------

async function exportToCsv(sessions: Session[]): Promise<void> {
  const rows: string[] = [
    // Header row
    [
      "Session ID",
      "Date",
      "Total Earnings",
      "Base Pay",
      "Tips",
      "Start Time",
      "End Time",
      "Active Time (min)",
      "Total Time (min)",
      "Offers Count",
      "Deliveries",
      "Offer Store",
      "Offer Earnings",
    ].join(","),
  ];

  for (const session of sessions) {
    const offers = await OfferService.getBySessionId(session.id);

    if (offers.length === 0) {
      // One row per session even if no offers
      rows.push(
        [
          session.id,
          session.date,
          session.total_earnings ?? "",
          session.base_pay ?? "",
          session.tips ?? "",
          session.start_time ?? "",
          session.end_time ?? "",
          session.active_time ?? "",
          session.total_time ?? "",
          session.offers_count ?? "",
          session.deliveries ?? "",
          "",
          "",
        ].join(",")
      );
    } else {
      // One row per offer, repeating session fields
      offers.forEach((offer) => {
        rows.push(
          [
            session.id,
            session.date,
            session.total_earnings ?? "",
            session.base_pay ?? "",
            session.tips ?? "",
            session.start_time ?? "",
            session.end_time ?? "",
            session.active_time ?? "",
            session.total_time ?? "",
            session.offers_count ?? "",
            session.deliveries ?? "",
            `"${offer.store ?? ""}"`,
            offer.total_earnings ?? "",
          ].join(",")
        );
      });
    }
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dashlens-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Sub-component: DateRangePicker
// ---------------------------------------------------------------------------

function DateRangePicker({
  preset,
  customRange,
  onPresetChange,
  onCustomRangeChange,
}: {
  preset: DateRangePreset;
  customRange: { from?: Date; to?: Date };
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRangeChange: (range: { from?: Date; to?: Date }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Quick preset tabs */}
      <Tabs value={preset} onValueChange={(v) => onPresetChange(v as DateRangePreset)}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Custom date range picker — only shown when custom preset is active */}
      {preset === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 text-sm">
              <CalendarIcon className="size-4" />
              {customRange.from ? (
                customRange.to ? (
                  <>
                    {format(customRange.from, "MMM d")} –{" "}
                    {format(customRange.to, "MMM d, yyyy")}
                  </>
                ) : (
                  format(customRange.from, "MMM d, yyyy")
                )
              ) : (
                "Pick dates"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={(range) => onCustomRangeChange(range ?? {})}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ExpandableSessionRow
// Renders a single session row. On expand, fetches and renders its offers.
// ---------------------------------------------------------------------------

function ExpandableSessionRow({ session }: { session: Session }) {
  const [expanded, setExpanded] = React.useState(false);
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [loadingOffers, setLoadingOffers] = React.useState(false);

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);

    // Fetch offers on first expand only
    if (next && offers.length === 0) {
      setLoadingOffers(true);
      try {
        const result = await OfferService.getBySessionId(session.id);
        setOffers(result);
      } catch (err) {
        console.error("Failed to load offers for session", session.id, err);
      } finally {
        setLoadingOffers(false);
      }
    }
  }

  return (
    <>
      {/* Session summary row */}
      <TableRow
        className="cursor-pointer select-none"
        onClick={handleExpand}
      >
        {/* Expand toggle */}
        <TableCell className="w-8 px-2">
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </TableCell>

        {/* Date */}
        <TableCell className="font-mono text-xs">
          {format(parseISO(session.date), "MMM d, yyyy")}
        </TableCell>

        {/* Total Earnings */}
        <TableCell className="font-medium tabular-nums">
          {formatCurrency(session.total_earnings)}
        </TableCell>

        {/* Base Pay + Tips breakdown */}
        <TableCell className="text-xs text-muted-foreground tabular-nums">
          {session.base_pay !== null || session.tips !== null ? (
            <span>
              {formatCurrency(session.base_pay)} pay /{" "}
              {formatCurrency(session.tips)} tips
            </span>
          ) : (
            "—"
          )}
        </TableCell>

        {/* Time on road */}
        <TableCell className="tabular-nums text-sm">
          {formatMinutes(session.active_time)}
          {session.total_time !== null && (
            <span className="text-muted-foreground text-xs ml-1">
              / {formatMinutes(session.total_time)}
            </span>
          )}
        </TableCell>

        {/* Deliveries */}
        <TableCell className="text-center tabular-nums">
          {session.deliveries ?? "—"}
        </TableCell>

        {/* Offers count */}
        <TableCell className="text-center">
          {session.offers_count !== null ? (
            <Badge variant="secondary">{session.offers_count}</Badge>
          ) : (
            "—"
          )}
        </TableCell>
      </TableRow>

      {/* Expanded offer rows */}
      {expanded && (
        <>
          {loadingOffers ? (
            <TableRow>
              <TableCell colSpan={7} className="py-2 pl-10">
                <Skeleton className="h-4 w-48" />
              </TableCell>
            </TableRow>
          ) : offers.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-2 pl-10 text-xs text-muted-foreground italic"
              >
                No individual offers recorded for this session.
              </TableCell>
            </TableRow>
          ) : (
            offers.map((offer) => (
              <TableRow
                key={offer.id}
                className="bg-muted/30 hover:bg-muted/40"
              >
                {/* Indent spacer */}
                <TableCell colSpan={2} />

                {/* Store name spans earnings col */}
                <TableCell
                  colSpan={2}
                  className="text-xs text-muted-foreground pl-6"
                >
                  📦 {offer.store ?? "Unknown store"}
                </TableCell>

                {/* Offer earnings */}
                <TableCell className="tabular-nums text-xs font-medium">
                  {formatCurrency(offer.total_earnings)}
                </TableCell>

                {/* Empty cells to fill row */}
                <TableCell colSpan={2} />
              </TableRow>
            ))
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: TableSkeleton
// Shown while initial session data is loading.
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell colSpan={7}>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Data Page
// ---------------------------------------------------------------------------

export function Data() {
  // -- State --

  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>("month");
  const [customDateRange, setCustomDateRange] = React.useState<{
    from?: Date;
    to?: Date;
  }>({});

  // -- Data fetch --

  const fetchSessions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await SessionService.getAll();
      setSessions(data);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load sessions from the database."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // -- Derived: filtered sessions --

  const filteredSessions = React.useMemo(() => {
    let filtered = sessions;

    // Text search: match against date string (ISO) for now.
    // Offer-level store search requires loading all offers — deferred to a
    // future enhancement to keep the initial render fast.
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => s.date.toLowerCase().includes(query));
    }

    // Date range filter — compare session.date (YYYY-MM-DD) against the range
    const range =
      datePreset === "custom" ? customDateRange : getPresetDateRange(datePreset);

    if (range?.from) {
      const fromMs = range.from.getTime();
      const toMs = range.to?.getTime() ?? Date.now();
      filtered = filtered.filter((s) => {
        const sessionMs = parseISO(s.date).getTime();
        return sessionMs >= fromMs && sessionMs <= toMs;
      });
    }

    return filtered;
  }, [sessions, searchQuery, datePreset, customDateRange]);

  // -- Handlers --

  async function handleExport() {
    setExporting(true);
    try {
      await exportToCsv(filteredSessions);
    } catch (err) {
      console.error("CSV export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 pt-4">
      {/* Page header */}
      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>
            View all recorded sessions and their individual offers. Filter by date or
            search, then expand any row to see per-offer breakdown.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Failed to load data</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-4 gap-2"
              onClick={fetchSessions}
            >
              <RefreshCw className="size-3" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters toolbar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Search input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by date (e.g. 2025-01)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Date range picker */}
            <DateRangePicker
              preset={datePreset}
              customRange={customDateRange}
              onPresetChange={setDatePreset}
              onCustomRangeChange={setCustomDateRange}
            />

            {/* Export button */}
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || filteredSessions.length === 0}
              className="gap-2"
            >
              {exporting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results summary */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading sessions…"
            : `Showing ${filteredSessions.length} of ${sessions.length} sessions`}
        </p>
      </div>

      {/* Data table */}
      <Card>
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                {/* Expand toggle spacer */}
                <TableHead className="w-8" />
                <TableHead className="w-[130px]">Date</TableHead>
                <TableHead className="w-[120px]">Total</TableHead>
                <TableHead>Pay / Tips</TableHead>
                <TableHead className="w-[140px]">Active / Total</TableHead>
                <TableHead className="w-[100px] text-center">Deliveries</TableHead>
                <TableHead className="w-[90px] text-center">Offers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton />
              ) : filteredSessions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No sessions found. Try adjusting your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSessions.map((session) => (
                  <ExpandableSessionRow key={session.id} session={session} />
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}
