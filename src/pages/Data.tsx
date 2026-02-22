// ---------------------------------------------------------------------------
// Data Page
// Flat table of all sessions — every DB column visible. Clicking a row opens
// the SessionDetailSheet for full read/edit view of that session + its offers.
//
// Filtering: text search against date + time fields, date-range presets + custom.
// Export: CSV of filtered sessions with their offers.
// ---------------------------------------------------------------------------

import * as React from "react";
import {
  Calendar as CalendarIcon,
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
import { SessionDetailSheet } from "@/components/session-detail/SessionDetailSheet";

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
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt$(v: number | null): string {
  return v !== null ? `$${v.toFixed(2)}` : "—";
}

function fmtMinutes(v: number | null): string {
  if (v === null) return "—";
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

async function exportToCsv(sessions: Session[]): Promise<void> {
  const rows: string[] = [
    [
      "Session ID", "Date", "Start", "End",
      "Total Earnings", "Base Pay", "Tips",
      "Active Time (min)", "Total Time (min)",
      "Offers Count", "Deliveries",
      "Offer Store", "Offer Earnings",
    ].join(","),
  ];

  for (const session of sessions) {
    const offers = await OfferService.getBySessionId(session.id);
    const base = [
      session.id, session.date,
      session.start_time ?? "", session.end_time ?? "",
      session.total_earnings ?? "", session.base_pay ?? "", session.tips ?? "",
      session.active_time ?? "", session.total_time ?? "",
      session.offers_count ?? "", session.deliveries ?? "",
    ];
    if (offers.length === 0) {
      rows.push([...base, "", ""].join(","));
    } else {
      offers.forEach((o) =>
        rows.push([...base, `"${o.store ?? ""}"`, o.total_earnings ?? ""].join(","))
      );
    }
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `dashlens-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
      <Tabs value={preset} onValueChange={(v) => onPresetChange(v as DateRangePreset)}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
      </Tabs>

      {preset === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 text-sm">
              <CalendarIcon className="size-4" />
              {customRange.from ? (
                customRange.to ? (
                  <>{format(customRange.from, "MMM d")} – {format(customRange.to, "MMM d, yyyy")}</>
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
// Sub-component: TableSkeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 10 }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Data Page
// ---------------------------------------------------------------------------

export function Data() {
  // -- Sessions state --
  const [sessions, setSessions]     = React.useState<Session[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [error, setError]           = React.useState<string | null>(null);
  const [exporting, setExporting]   = React.useState(false);

  // -- Filter state --
  const [searchQuery, setSearchQuery]           = React.useState("");
  const [datePreset, setDatePreset]             = React.useState<DateRangePreset>("month");
  const [customDateRange, setCustomDateRange]   = React.useState<{ from?: Date; to?: Date }>({});

  // -- Detail sheet state --
  // Offers are fetched lazily on row click and cached by session ID
  const [selectedSession, setSelectedSession]   = React.useState<Session | null>(null);
  const [selectedOffers, setSelectedOffers]     = React.useState<Offer[]>([]);
  const [sheetOpen, setSheetOpen]               = React.useState(false);
  const [loadingOffers, setLoadingOffers]       = React.useState(false);
  // Cache offers per session to avoid redundant fetches within the same page load
  const offersCache = React.useRef<Map<number, Offer[]>>(new Map());

  // -- Data fetch --

  const fetchSessions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await SessionService.getAll();
      setSessions(data);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError(err instanceof Error ? err.message : "Failed to load sessions from the database.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // -- Filtered sessions --

  const filteredSessions = React.useMemo(() => {
    let filtered = sessions;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.date.includes(q) ||
          (s.start_time ?? "").toLowerCase().includes(q) ||
          (s.end_time ?? "").toLowerCase().includes(q)
      );
    }

    const range = datePreset === "custom" ? customDateRange : getPresetDateRange(datePreset);
    if (range?.from) {
      const fromMs = range.from.getTime();
      const toMs   = range.to?.getTime() ?? Date.now();
      filtered = filtered.filter((s) => {
        const t = parseISO(s.date).getTime();
        return t >= fromMs && t <= toMs;
      });
    }

    return filtered;
  }, [sessions, searchQuery, datePreset, customDateRange]);

  // -- Row click → open sheet --

  async function handleRowClick(session: Session) {
    setSelectedSession(session);
    setSheetOpen(true);

    // Serve from cache if available
    if (offersCache.current.has(session.id)) {
      setSelectedOffers(offersCache.current.get(session.id)!);
      return;
    }

    setLoadingOffers(true);
    setSelectedOffers([]);
    try {
      const offers = await OfferService.getBySessionId(session.id);
      offersCache.current.set(session.id, offers);
      setSelectedOffers(offers);
    } catch (err) {
      console.error("Failed to load offers for session", session.id, err);
    } finally {
      setLoadingOffers(false);
    }
  }

  // -- Sheet callbacks --

  function handleSessionUpdate(updated: Session) {
    // Patch the in-memory list so the table reflects the edit instantly
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSelectedSession(updated);
    // Invalidate the offers cache for this session so re-open fetches fresh data
    offersCache.current.delete(updated.id);
  }

  function handleSessionDelete(sessionId: number) {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    offersCache.current.delete(sessionId);
  }

  // -- Export --

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
            All recorded sessions. Click any row to view full details or edit.
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
            <Button variant="outline" size="sm" className="ml-4 gap-2" onClick={fetchSessions}>
              <RefreshCw className="size-3" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters toolbar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by date or time…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <DateRangePicker
              preset={datePreset}
              customRange={customDateRange}
              onPresetChange={setDatePreset}
              onCustomRangeChange={setCustomDateRange}
            />

            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || filteredSessions.length === 0}
              className="gap-2"
            >
              {exporting ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results summary */}
      <div className="px-1">
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
                <TableHead className="w-[130px]">Date</TableHead>
                <TableHead className="w-[105px]">Start</TableHead>
                <TableHead className="w-[105px]">End</TableHead>
                <TableHead className="w-[110px]">Total</TableHead>
                <TableHead className="w-[110px]">Base Pay</TableHead>
                <TableHead className="w-[100px]">Tips</TableHead>
                <TableHead className="w-[110px]">Active</TableHead>
                <TableHead className="w-[110px]">Total Time</TableHead>
                <TableHead className="w-[100px] text-center">Deliveries</TableHead>
                <TableHead className="w-[80px] text-center">Offers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton />
              ) : filteredSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    No sessions found. Try adjusting your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSessions.map((session) => (
                  <TableRow
                    key={session.id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(session)}
                  >
                    <TableCell className="font-mono text-xs">
                      {format(parseISO(session.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {session.start_time ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {session.end_time ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {fmt$(session.total_earnings)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground text-sm">
                      {fmt$(session.base_pay)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground text-sm">
                      {fmt$(session.tips)}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {fmtMinutes(session.active_time)}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {fmtMinutes(session.total_time)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {session.deliveries ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {session.offers_count !== null ? (
                        <Badge variant="secondary">{session.offers_count}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Session detail / edit sheet */}
      <SessionDetailSheet
        session={selectedSession}
        offers={loadingOffers ? [] : selectedOffers}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdate={handleSessionUpdate}
        onDelete={handleSessionDelete}
      />

    </div>
  );
}
