// ---------------------------------------------------------------------------
// Analytics Page
// Metrics are grouped into four themed cards (Earnings, Time, Activity,
// Efficiency) that mirror the spreadsheet columns the user tracks manually.
//
// Fields not yet in the DB (Other Pay, Miles) render placeholder rows with
// a "coming soon" badge so the layout is stable when those columns land.
//
// Charts: Earnings Over Time · Best Days to Dash · Top Stores by Earnings
// ---------------------------------------------------------------------------

import * as React from "react";
import {
  TrendingUp,
  AlertCircle,
  RefreshCw,
  DollarSign,
  Clock,
  Activity,
  Package,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import { format, parseISO, startOfWeek, startOfMonth, startOfYear, getDay } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import { SessionService, OfferService } from "@/services/entryService";
import type { Session, Offer } from "@/types/entries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimeRange = "today" | "week" | "month" | "year";

interface SessionWithOffers {
  session: Session;
  offers: Offer[];
}

// ---------------------------------------------------------------------------
// Date-range helpers
// ---------------------------------------------------------------------------

function getRangeStart(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "today": return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week":  return startOfWeek(now, { weekStartsOn: 1 });
    case "month": return startOfMonth(now);
    case "year":  return startOfYear(now);
  }
}

function inRange(dateStr: string, start: Date): boolean {
  return parseISO(dateStr).getTime() >= start.getTime();
}

// ---------------------------------------------------------------------------
// Analytics computation
// All pure functions — isolated so they're easy to unit-test later.
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Safe division — returns null instead of Infinity/NaN */
function safeDiv(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function computeMetrics(data: SessionWithOffers[], range: TimeRange) {
  const start    = getRangeStart(range);
  const filtered = data.filter((d) => inRange(d.session.date, start));
  const sessions = filtered.map((d) => d.session);

  // ── Earnings ─────────────────────────────────────────────────────────────
  const totalEarnings = sessions.reduce((s, x) => s + (x.total_earnings ?? 0), 0);
  const totalBasePay  = sessions.reduce((s, x) => s + (x.base_pay ?? 0), 0);
  const totalTips     = sessions.reduce((s, x) => s + (x.tips ?? 0), 0);
  // Tip ratio: tips as a share of total earnings
  const tipRatio = safeDiv(totalTips, totalEarnings);

  // ── Time ──────────────────────────────────────────────────────────────────
  const totalMinutes  = sessions.reduce((s, x) => s + (x.total_time  ?? 0), 0);
  const activeMinutes = sessions.reduce((s, x) => s + (x.active_time ?? 0), 0);
  const deadMinutes   = totalMinutes - activeMinutes;
  const deadPct       = safeDiv(deadMinutes, totalMinutes);

  // ── Activity ──────────────────────────────────────────────────────────────
  const sessionCount     = sessions.length;
  const totalDeliveries  = sessions.reduce((s, x) => s + (x.deliveries ?? 0), 0);
  // Unique days worked is the denominator for per-day rates
  const uniqueDays       = new Set(sessions.map((s) => s.date)).size;
  const sessionsPerDay   = safeDiv(sessionCount, uniqueDays);
  const deliveriesPerDay = safeDiv(totalDeliveries, uniqueDays);

  // ── Efficiency ────────────────────────────────────────────────────────────
  const totalHours  = totalMinutes  / 60;
  const activeHours = activeMinutes / 60;
  const dphTotal    = safeDiv(totalEarnings, totalHours);   // primary $/hr metric
  const dphActive   = safeDiv(totalEarnings, activeHours);
  const dps         = safeDiv(totalEarnings, sessionCount);
  const dpd         = safeDiv(totalEarnings, totalDeliveries);
  // dpm ($/mile) deferred — miles column not yet in DB

  // ── Chart: daily earnings ─────────────────────────────────────────────────
  const earningsByDate: Record<string, number> = {};
  sessions.forEach((s) => {
    earningsByDate[s.date] = (earningsByDate[s.date] ?? 0) + (s.total_earnings ?? 0);
  });
  const dailyEarnings = Object.entries(earningsByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, earnings]) => ({
      date,
      label:    format(parseISO(date), "MMM d"),
      earnings: parseFloat(earnings.toFixed(2)),
    }));

  // ── Chart: day-of-week average earnings ───────────────────────────────────
  const dowMap: Record<number, { total: number; count: number }> = {};
  sessions.forEach((s) => {
    const dow = getDay(parseISO(s.date));
    if (!dowMap[dow]) dowMap[dow] = { total: 0, count: 0 };
    dowMap[dow].total += s.total_earnings ?? 0;
    dowMap[dow].count += 1;
  });
  const maxDowAvg = Math.max(
    ...Object.values(dowMap).map((v) => v.total / v.count),
    0
  );
  const dowEarnings = DAY_NAMES.map((name, i) => ({
    day:      name,
    avg:      dowMap[i] ? parseFloat((dowMap[i].total / dowMap[i].count).toFixed(2)) : 0,
    sessions: dowMap[i]?.count ?? 0,
    // Flag the peak day for a distinct bar color
    isPeak:   dowMap[i]
      ? dowMap[i].total / dowMap[i].count === maxDowAvg && maxDowAvg > 0
      : false,
  }));

  // ── Chart: top stores by cumulative offer earnings ────────────────────────
  const allOffers = filtered.flatMap((d) => d.offers);
  const storeMap: Record<string, { earnings: number; count: number }> = {};
  allOffers.forEach((offer) => {
    const store = offer.store ?? "Unknown";
    if (!storeMap[store]) storeMap[store] = { earnings: 0, count: 0 };
    storeMap[store].earnings += offer.total_earnings ?? 0;
    storeMap[store].count   += 1;
  });
  const topStores = Object.entries(storeMap)
    .map(([store, { earnings, count }]) => ({
      store,
      earnings: parseFloat(earnings.toFixed(2)),
      count,
    }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 8);

  return {
    totalEarnings, totalBasePay, totalTips, tipRatio,
    totalMinutes, activeMinutes, deadMinutes, deadPct,
    sessionCount, totalDeliveries, uniqueDays, sessionsPerDay, deliveriesPerDay,
    dphTotal, dphActive, dps, dpd,
    dailyEarnings, dowEarnings, topStores,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt$(value: number | null): string {
  if (value === null || isNaN(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function fmtMinutes(minutes: number): string {
  if (minutes === 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDecimal(value: number | null, places = 1): string {
  if (value === null) return "—";
  return value.toFixed(places);
}

// ---------------------------------------------------------------------------
// Sub-component: ComingSoonBadge
// Inline indicator for metrics whose DB column doesn't exist yet.
// ---------------------------------------------------------------------------

function ComingSoonBadge() {
  return (
    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
      soon
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: MetricRow
// Single label → value row inside a MetricGroupCard.
// ---------------------------------------------------------------------------

function MetricRow({
  label,
  value,
  primary,
  badge,
  loading,
}: {
  label: string;
  value: string;
  /** When true, renders the value in a heavier weight to designate it as the headline stat */
  primary?: boolean;
  badge?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className={`text-sm ${primary ? "font-medium text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        {badge}
        {loading ? (
          <Skeleton className="h-4 w-16" />
        ) : (
          <span className={`tabular-nums ${primary ? "text-base font-bold" : "text-sm font-medium"}`}>
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: MetricGroupCard
// Card with icon header and divider-separated MetricRows.
// ---------------------------------------------------------------------------

function MetricGroupCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border px-6">
        {children}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: EmptyChart
// ---------------------------------------------------------------------------

function EmptyChart({ message = "No data for this period" }: { message?: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart configs — bind to design-token colors via ChartContainer
// ---------------------------------------------------------------------------

const earningsChartConfig: ChartConfig = {
  earnings: { label: "Earnings", color: "hsl(var(--chart-1))" },
};
const dowChartConfig: ChartConfig = {
  avg: { label: "Avg Earnings", color: "hsl(var(--chart-2))" },
};
const storeChartConfig: ChartConfig = {
  earnings: { label: "Earnings", color: "hsl(var(--chart-3))" },
};

// ---------------------------------------------------------------------------
// Analytics Page
// ---------------------------------------------------------------------------

export function Analytics() {
  const [allData, setAllData]     = React.useState<SessionWithOffers[]>([]);
  const [loading, setLoading]     = React.useState(true);
  const [error, setError]         = React.useState<string | null>(null);
  const [timeRange, setTimeRange] = React.useState<TimeRange>("week");

  // -- Data fetch --
  // Load all sessions once; offers are parallelised. Tab switches are
  // instant because all filtering/aggregation happens client-side.

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessions     = await SessionService.getAll();
      const offerResults = await Promise.all(
        sessions.map((s) => OfferService.getBySessionId(s.id))
      );
      setAllData(sessions.map((session, i) => ({ session, offers: offerResults[i] })));
    } catch (err) {
      console.error("Analytics fetch failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load analytics data.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  // -- Derived metrics --
  const m = React.useMemo(() => computeMetrics(allData, timeRange), [allData, timeRange]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-4">

      {/* Page header + time range toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? "Loading…" : `${m.sessionCount} sessions · ${m.uniqueDays} days worked`}
          </p>
        </div>
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Failed to load analytics</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            {error}
            <button
              onClick={fetchData}
              className="ml-4 flex items-center gap-1 text-xs underline"
            >
              <RefreshCw className="size-3" /> Retry
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Metric group cards (2×2 on md, 4-col on xl) ─────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

        {/* Earnings */}
        <MetricGroupCard title="Earnings" icon={DollarSign}>
          <MetricRow label="Total Earnings" value={fmt$(m.totalEarnings)} primary loading={loading} />
          <MetricRow label="Base Pay"       value={fmt$(m.totalBasePay)}          loading={loading} />
          <MetricRow label="Tips"           value={fmt$(m.totalTips)}             loading={loading} />
          <MetricRow label="Other Pay"      value="—" badge={<ComingSoonBadge />} loading={loading} />
          <MetricRow label="Tip Ratio"      value={fmtPct(m.tipRatio)}            loading={loading} />
        </MetricGroupCard>

        {/* Time */}
        <MetricGroupCard title="Time" icon={Clock}>
          <MetricRow label="Total Time"  value={fmtMinutes(m.totalMinutes)}  loading={loading} />
          <MetricRow label="Active Time" value={fmtMinutes(m.activeMinutes)} loading={loading} />
          <MetricRow label="Dead Time"   value={fmtMinutes(m.deadMinutes)}   loading={loading} />
          <MetricRow label="Dead Time %" value={fmtPct(m.deadPct)}           loading={loading} />
        </MetricGroupCard>

        {/* Activity */}
        <MetricGroupCard title="Activity" icon={Activity}>
          <MetricRow label="Sessions"          value={String(m.sessionCount)}       loading={loading} />
          <MetricRow label="Deliveries"        value={String(m.totalDeliveries)}    loading={loading} />
          <MetricRow label="Sessions / Day"    value={fmtDecimal(m.sessionsPerDay)} loading={loading} />
          <MetricRow label="Deliveries / Day"  value={fmtDecimal(m.deliveriesPerDay)} loading={loading} />
          <MetricRow label="Miles"             value="—" badge={<ComingSoonBadge />} loading={loading} />
        </MetricGroupCard>

        {/* Efficiency */}
        <MetricGroupCard title="Efficiency" icon={TrendingUp}>
          {/* dphTotal is the primary headline stat — matches the spreadsheet's preferred $/hr */}
          <MetricRow label="$ / hr (total)"  value={fmt$(m.dphTotal)}  primary loading={loading} />
          <MetricRow label="$ / hr (active)" value={fmt$(m.dphActive)}         loading={loading} />
          <MetricRow label="$ / session"     value={fmt$(m.dps)}               loading={loading} />
          <MetricRow label="$ / delivery"    value={fmt$(m.dpd)}               loading={loading} />
          <MetricRow label="$ / mile"        value="—" badge={<ComingSoonBadge />} loading={loading} />
        </MetricGroupCard>

      </div>

      {/* ── Charts row: daily earnings + best day of week ────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Earnings Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Earnings Over Time</CardTitle>
            <CardDescription>Daily total earnings for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : m.dailyEarnings.length === 0 ? (
              <div className="h-64"><EmptyChart /></div>
            ) : (
              <ChartContainer config={earningsChartConfig} className="h-64 w-full">
                <BarChart data={m.dailyEarnings}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={48}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [`$${Number(value).toFixed(2)}`, "Earnings"]}
                      />
                    }
                  />
                  <Bar dataKey="earnings" fill="var(--color-earnings)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Best Days to Dash */}
        <Card>
          <CardHeader>
            <CardTitle>Best Days to Dash</CardTitle>
            <CardDescription>Average earnings by day of the week</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : m.sessionCount === 0 ? (
              <div className="h-64"><EmptyChart /></div>
            ) : (
              <ChartContainer config={dowChartConfig} className="h-64 w-full">
                <BarChart data={m.dowEarnings}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={48}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, _, item) => [
                          `$${Number(value).toFixed(2)} avg (${item.payload.sessions} sessions)`,
                          "Earnings",
                        ]}
                      />
                    }
                  />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {m.dowEarnings.map((entry, i) => (
                      <Cell
                        key={`cell-${i}`}
                        // Peak day rendered in the primary chart color so it stands out
                        fill={entry.isPeak ? "hsl(var(--chart-1))" : "var(--color-avg)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Chart: Top stores ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Top Stores by Earnings</CardTitle>
          <CardDescription>
            Cumulative earnings from individual offers, ranked by store
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : m.topStores.length === 0 ? (
            <div className="h-64">
              <EmptyChart message="No offer data recorded yet" />
            </div>
          ) : (
            <ChartContainer config={storeChartConfig} className="h-64 w-full">
              <BarChart
                data={m.topStores}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `$${v}`}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="store"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _, item) => [
                        `$${Number(value).toFixed(2)} (${item.payload.count} offers)`,
                        "Earnings",
                      ]}
                    />
                  }
                />
                <Bar
                  dataKey="earnings"
                  fill="var(--color-earnings)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
