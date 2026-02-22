import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, CheckCircle, Activity, Users, FileText, ArrowRight, Calendar, AlertTriangle, Clock } from "lucide-react";

interface StaleCarePlan {
  id: string;
  patientId: string;
  status: string;
  createdAt: string;
  ageHours: number;
}

interface AnalyticsData {
  statusCounts: Record<string, number>;
  pipeline: {
    uploaded: number;
    simplified: number;
    translated: number;
    sentToPatient: number;
  };
  checkIns: {
    total: number;
    responded: number;
    responseRate: number;
    green: number;
    yellow: number;
    red: number;
  };
  tcm: {
    totalPatientsSent: number;
    eligible99495: number;
    eligible99496: number;
    contactWithin2Days: number;
    missingDischargeDate: number;
  };
  staleCarePlans: StaleCarePlan[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-400" },
  pending_review: { label: "Pending Review", color: "bg-yellow-500" },
  interpreter_review: { label: "Interpreter Review", color: "bg-orange-500" },
  interpreter_approved: { label: "Interpreter Approved", color: "bg-blue-500" },
  approved: { label: "Approved", color: "bg-emerald-500" },
  sent: { label: "Sent", color: "bg-indigo-500" },
  completed: { label: "Completed", color: "bg-green-600" },
};

const TIME_WINDOWS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All time", days: 0 },
];

function StatusFunnel({ statusCounts }: { statusCounts: Record<string, number> }) {
  const funnelStages = [
    { key: "draft", label: "Created", color: "bg-gray-400" },
    { key: "pending_review", label: "In Review", color: "bg-yellow-500", mergeKeys: ["pending_review", "interpreter_review", "interpreter_approved"] },
    { key: "approved", label: "Approved", color: "bg-emerald-500" },
    { key: "sent", label: "Sent", color: "bg-indigo-500" },
    { key: "completed", label: "Completed", color: "bg-green-600" },
  ];

  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const funnelData = funnelStages.map(stage => {
    if (stage.mergeKeys) {
      const count = stage.mergeKeys.reduce((sum, k) => sum + (statusCounts[k] || 0), 0);
      return { ...stage, count };
    }
    return { ...stage, count: statusCounts[stage.key] || 0 };
  });

  const cumulativeCounts = funnelData.map((_, idx) =>
    funnelData.slice(idx).reduce((sum, s) => sum + s.count, 0)
  );

  return (
    <div className="space-y-1" data-testid="section-status-funnel">
      {funnelData.map((stage, idx) => {
        const cumulative = cumulativeCounts[idx];
        const widthPct = total > 0 ? Math.max((cumulative / total) * 100, 8) : 8;
        const conversionRate = idx > 0 && cumulativeCounts[idx - 1] > 0
          ? Math.round((cumulative / cumulativeCounts[idx - 1]) * 100)
          : 100;

        return (
          <div key={stage.key}>
            <div className="flex items-center gap-2" data-testid={`funnel-stage-${stage.key}`}>
              <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{stage.label}</span>
              <div className="flex-1 flex justify-center">
                <div
                  className={`h-10 ${stage.color} rounded-md flex items-center justify-center transition-all duration-500`}
                  style={{ width: `${widthPct}%` }}
                >
                  <span className="text-white text-sm font-semibold drop-shadow">{cumulative}</span>
                </div>
              </div>
              {idx > 0 && (
                <span className="text-xs text-muted-foreground w-12 shrink-0">{conversionRate}%</span>
              )}
              {idx === 0 && <span className="w-12 shrink-0" />}
            </div>
            {idx < funnelData.length - 1 && (
              <div className="flex justify-center py-0.5">
                <ArrowRight className="h-3 w-3 text-muted-foreground/40 rotate-90" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBar({ statusCounts }: { statusCounts: Record<string, number> }) {
  const maxCount = Math.max(...Object.values(statusCounts), 1);

  return (
    <div className="space-y-3" data-testid="section-status-counts">
      {Object.entries(STATUS_CONFIG).map(([key, config]) => {
        const count = statusCounts[key] || 0;
        const widthPercent = count > 0 ? (count / maxCount) * 100 : 0;
        return (
          <div key={key} className="flex items-center gap-3" data-testid={`status-row-${key}`}>
            <span className="text-sm text-muted-foreground w-40 shrink-0">{config.label}</span>
            <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
              <div
                className={`h-full ${config.color} rounded-md transition-all duration-500`}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
            <span className="text-sm font-medium w-8 text-right" data-testid={`status-count-${key}`}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function PipelineStage({ label, count, total, icon }: { label: string; count: number; total: number; icon: React.ReactNode }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50" data-testid={`pipeline-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{count}</p>
      </div>
      <Badge variant="secondary" className="text-xs">{pct}%</Badge>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-6" data-testid="analytics-loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [selectedDays, setSelectedDays] = useState(0);

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", selectedDays],
    queryFn: async () => {
      const url = selectedDays > 0 ? `/api/analytics?days=${selectedDays}` : "/api/analytics";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="p-6 flex items-center justify-center h-full" data-testid="analytics-error">
        <p className="text-muted-foreground">Failed to load analytics data.</p>
      </div>
    );
  }

  const { statusCounts, pipeline, checkIns, tcm } = data;

  return (
    <div className="p-6 space-y-6" data-testid="analytics-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1" data-testid="time-window-selector">
          {TIME_WINDOWS.map((tw) => (
            <Button
              key={tw.days}
              variant={selectedDays === tw.days ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setSelectedDays(tw.days)}
              data-testid={`time-window-${tw.days}`}
            >
              {tw.days === 0 ? <Calendar className="h-3 w-3 mr-1" /> : null}
              {tw.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-status-funnel">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Care Plan Funnel
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {Object.values(statusCounts).reduce((a, b) => a + b, 0)} total
            </Badge>
          </CardHeader>
          <CardContent>
            <StatusFunnel statusCounts={statusCounts} />
          </CardContent>
        </Card>

        <Card data-testid="card-status-counts">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Care Plans by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBar statusCounts={statusCounts} />
          </CardContent>
        </Card>

        <Card data-testid="card-pipeline">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Processing Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <PipelineStage label="Uploaded" count={pipeline.uploaded} total={pipeline.uploaded} icon={<FileText className="h-4 w-4" />} />
              <PipelineStage label="Simplified" count={pipeline.simplified} total={pipeline.uploaded} icon={<CheckCircle className="h-4 w-4" />} />
              <PipelineStage label="Translated" count={pipeline.translated} total={pipeline.uploaded} icon={<Activity className="h-4 w-4" />} />
              <PipelineStage label="Sent to Patient" count={pipeline.sentToPatient} total={pipeline.uploaded} icon={<Users className="h-4 w-4" />} />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-checkins">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Check-in Response Rates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm text-muted-foreground">Total Scheduled</p>
                  <p className="text-2xl font-bold" data-testid="text-total-checkins">{checkIns.total}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Response Rate</p>
                  <p className="text-2xl font-bold" data-testid="text-response-rate">{checkIns.responseRate}%</p>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { label: "Doing Well", key: "green" as const, color: "bg-green-500", count: checkIns.green },
                  { label: "Has Questions", key: "yellow" as const, color: "bg-yellow-500", count: checkIns.yellow },
                  { label: "Needs Help", key: "red" as const, color: "bg-red-500", count: checkIns.red },
                ].map((item) => {
                  const pct = checkIns.responded > 0 ? Math.round((item.count / checkIns.responded) * 100) : 0;
                  return (
                    <div key={item.key} className="flex items-center gap-3" data-testid={`checkin-${item.key}`}>
                      <div className={`w-3 h-3 rounded-full ${item.color} shrink-0`} />
                      <span className="text-sm text-muted-foreground flex-1">{item.label}</span>
                      <span className="text-sm font-medium" data-testid={`checkin-count-${item.key}`}>{item.count}</span>
                      <Badge variant="secondary" className="text-xs w-12 justify-center">{pct}%</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-tcm" className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              TCM Compliance Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 rounded-md bg-muted/50" data-testid="tcm-total-sent">
                <p className="text-sm text-muted-foreground">Patients Sent</p>
                <p className="text-2xl font-bold">{tcm.totalPatientsSent}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/50" data-testid="tcm-contact-2day">
                <p className="text-sm text-muted-foreground">Contact within 2 Days</p>
                <p className="text-xs text-muted-foreground mb-1">Post-discharge contact</p>
                <p className="text-lg font-semibold">{tcm.contactWithin2Days}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/50" data-testid="tcm-99495">
                <p className="text-sm text-muted-foreground">CPT 99495 Eligible</p>
                <p className="text-xs text-muted-foreground mb-1">Contact + response within 14d</p>
                <p className="text-lg font-semibold">{tcm.eligible99495}</p>
              </div>
              <div className="p-3 rounded-md bg-muted/50" data-testid="tcm-99496">
                <p className="text-sm text-muted-foreground">CPT 99496 Eligible</p>
                <p className="text-xs text-muted-foreground mb-1">Contact + response within 7d</p>
                <p className="text-lg font-semibold">{tcm.eligible99496}</p>
              </div>
            </div>
            {tcm.missingDischargeDate > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 flex items-center gap-1" data-testid="tcm-missing-dates">
                <AlertTriangle className="h-3 w-3" />
                {tcm.missingDischargeDate} care plan(s) missing discharge date - TCM eligibility cannot be calculated.
              </p>
            )}
          </CardContent>
        </Card>

        {data.staleCarePlans && data.staleCarePlans.length > 0 && (
          <Card data-testid="card-stale-alerts" className="lg:col-span-2 border-amber-200 dark:border-amber-800">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Stale Care Plans
              </CardTitle>
              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                {data.staleCarePlans.length} needing attention
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Care plans stuck in draft (&gt;48h), pending review, or approved (&gt;72h) without being sent.
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {data.staleCarePlans.map((plan) => {
                  const statusLabel = STATUS_CONFIG[plan.status]?.label || plan.status;
                  const ageDays = Math.floor(plan.ageHours / 24);
                  const ageRemainder = plan.ageHours % 24;
                  const ageText = ageDays > 0 ? `${ageDays}d ${ageRemainder}h` : `${plan.ageHours}h`;
                  return (
                    <div key={plan.id} className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-sm" data-testid={`stale-plan-${plan.id}`}>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <span className="font-mono text-xs text-muted-foreground">{plan.id.slice(0, 8)}</span>
                        <Badge variant="secondary" className="text-xs">{statusLabel}</Badge>
                      </div>
                      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{ageText} old</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
