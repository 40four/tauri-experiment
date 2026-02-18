import * as React from "react";
import { Calendar as CalendarIcon, Filter, Download, Search } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, startOfYear } from "date-fns";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// ---------------------------------------------------------------------------
// Types & Mock Data
// These types mirror the future OCR entry schema. Replace with real DB queries
// once the entries table is created.
// ---------------------------------------------------------------------------

interface OcrEntry {
  id: number;
  created_at: string;
  image_name: string;
  extracted_text: string;
  confidence: number;
  status: "processed" | "pending" | "error";
}

// Placeholder data — replace with actual DB fetch
const MOCK_ENTRIES: OcrEntry[] = [
  {
    id: 1,
    created_at: new Date().toISOString(),
    image_name: "receipt_2024_01_15.png",
    extracted_text: "Total: $127.48\nDate: 01/15/2024\nStore: Whole Foods",
    confidence: 94.2,
    status: "processed",
  },
  {
    id: 2,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    image_name: "invoice_acme.jpg",
    extracted_text: "Invoice #12345\nAmount: $2,400.00\nDue: 02/01/2024",
    confidence: 87.5,
    status: "processed",
  },
  {
    id: 3,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    image_name: "screenshot_notes.png",
    extracted_text: "Meeting notes:\n- Q1 goals\n- Budget review\n- Team hiring",
    confidence: 91.8,
    status: "processed",
  },
];

// ---------------------------------------------------------------------------
// Date Range Presets
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
// Sub-components
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

function ConfidenceBadge({ score }: { score: number }) {
  const variant = score >= 90 ? "default" : score >= 70 ? "secondary" : "destructive";
  return <Badge variant={variant}>{score.toFixed(1)}%</Badge>;
}

// ---------------------------------------------------------------------------
// Data Page
// ---------------------------------------------------------------------------

export function Data() {
  const [entries, setEntries] = React.useState<OcrEntry[]>(MOCK_ENTRIES);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>("month");
  const [customDateRange, setCustomDateRange] = React.useState<{
    from?: Date;
    to?: Date;
  }>({});

  // Derived state: filtered entries based on search and date range
  const filteredEntries = React.useMemo(() => {
    let filtered = entries;

    // Text search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.image_name.toLowerCase().includes(query) ||
          e.extracted_text.toLowerCase().includes(query)
      );
    }

    // Date range filter
    const range =
      datePreset === "custom"
        ? customDateRange
        : getPresetDateRange(datePreset);

    if (range?.from) {
      const fromTime = range.from.getTime();
      const toTime = range.to?.getTime() ?? Date.now();
      filtered = filtered.filter((e) => {
        const entryTime = new Date(e.created_at).getTime();
        return entryTime >= fromTime && entryTime <= toTime;
      });
    }

    return filtered;
  }, [entries, searchQuery, datePreset, customDateRange]);

  // Placeholder handlers — wire up once DB service is implemented
  function handleExport() {
    console.log("Export to CSV — implement with real data");
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 pt-4">
      {/* Page header */}
      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>
            View and manage all extracted OCR data. Filter by date range or search text.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Filters toolbar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Search input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
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
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results summary */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          Showing {filteredEntries.length} of {entries.length} entries
        </p>
      </div>

      {/* Data table */}
      <Card>
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Date</TableHead>
                <TableHead className="w-[240px]">Image</TableHead>
                <TableHead>Extracted Text</TableHead>
                <TableHead className="w-[120px] text-center">Confidence</TableHead>
                <TableHead className="w-[100px] text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No entries found. Try adjusting your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(entry.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="truncate text-sm" title={entry.image_name}>
                      {entry.image_name}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm line-clamp-2 whitespace-pre-wrap">
                        {entry.extracted_text}
                      </p>
                    </TableCell>
                    <TableCell className="text-center">
                      <ConfidenceBadge score={entry.confidence} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          entry.status === "processed"
                            ? "default"
                            : entry.status === "pending"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Placeholder message */}
      <Card className="bg-muted/40">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            💡 <strong>Coming soon:</strong> Click any row to view full details, edit extracted
            text, or re-process images. Export functionality will save filtered data to CSV.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
