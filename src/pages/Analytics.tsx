import * as React from "react";
import {
  TrendingUp,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  BarChart3,
  PieChart,
  Activity,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types & Mock Data
// Replace with real aggregated queries once the OCR entries table exists
// ---------------------------------------------------------------------------

interface AnalyticsMetrics {
  totalEntries: number;
  processedToday: number;
  averageConfidence: number;
  successRate: number;
  totalTextExtracted: number; // character count
  mostActiveDay: string;
}

// Placeholder data — compute from DB aggregations
const MOCK_METRICS: AnalyticsMetrics = {
  totalEntries: 247,
  processedToday: 12,
  averageConfidence: 89.4,
  successRate: 96.8,
  totalTextExtracted: 142580,
  mostActiveDay: "Wednesday",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          {trend && (
            <Badge
              variant={trend.value >= 0 ? "default" : "secondary"}
              className="text-xs gap-1"
            >
              <TrendingUp className="size-3" />
              {trend.value > 0 ? "+" : ""}
              {trend.value}% {trend.label}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartPlaceholder({
  title,
  description,
  icon: Icon,
  height = "h-64",
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  height?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`${height} bg-muted/40 rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/20`}
        >
          <div className="text-center space-y-2">
            <Icon className="size-12 mx-auto text-muted-foreground/40" strokeWidth={1} />
            <p className="text-sm font-medium text-muted-foreground">
              Chart placeholder
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              {description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Analytics Page
// ---------------------------------------------------------------------------

export function Analytics() {
  const [timeRange, setTimeRange] = React.useState<"week" | "month" | "year">("month");
  const metrics = MOCK_METRICS;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            OCR performance metrics and usage insights
          </p>
        </div>

        {/* Time range selector */}
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Key metrics grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Entries"
          value={metrics.totalEntries.toLocaleString()}
          subtitle="All-time processed"
          icon={FileText}
          trend={{ value: 12, label: "vs last month" }}
        />
        <MetricCard
          title="Processed Today"
          value={metrics.processedToday}
          subtitle="New entries"
          icon={Clock}
          trend={{ value: 8, label: "vs yesterday" }}
        />
        <MetricCard
          title="Avg Confidence"
          value={`${metrics.averageConfidence.toFixed(1)}%`}
          subtitle="OCR accuracy"
          icon={CheckCircle2}
          trend={{ value: 2.3, label: "improvement" }}
        />
        <MetricCard
          title="Success Rate"
          value={`${metrics.successRate.toFixed(1)}%`}
          subtitle="Error-free processing"
          icon={Activity}
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Text Extraction Volume</CardTitle>
            <CardDescription>Total characters extracted from images</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(metrics.totalTextExtracted / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Equivalent to ~{Math.round(metrics.totalTextExtracted / 1800)} pages
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Peak Activity</CardTitle>
            <CardDescription>Most entries processed on this day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.mostActiveDay}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Optimize batch processing on high-volume days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart placeholders — wire up with recharts or similar when ready */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartPlaceholder
          title="Entries Over Time"
          description="Daily OCR processing volume with trend line"
          icon={BarChart3}
          height="h-80"
        />
        <ChartPlaceholder
          title="Confidence Distribution"
          description="Breakdown of OCR accuracy scores across all entries"
          icon={PieChart}
          height="h-80"
        />
      </div>

      <ChartPlaceholder
        title="Processing Time Analysis"
        description="Average time to process images by file size and complexity"
        icon={Activity}
        height="h-64"
      />

      {/* Coming soon callout */}
      <Card className="bg-muted/40 border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Chart visualizations coming soon</p>
              <p className="text-xs text-muted-foreground">
                Once real OCR data accumulates, these placeholders will be replaced with
                interactive charts powered by Recharts. Metrics will auto-update based on your
                selected time range (week/month/year).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
