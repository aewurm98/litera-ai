import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, CheckCircle, Activity, Users, FileText } from "lucide-react";

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
  };
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

function StatusBar({ statusCounts }: { statusCounts: Record<string, number> }) {
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...Object.values(statusCounts), 1);

  return (
    <div className="space-y-3" data-testid="section-status-counts">
      {Object.entries(STATUS_CONFIG).map(([key, config]) => {
        const count = statusCounts[key] || 0;
        const widthPercent = total > 0 ? (count / maxCount) * 100 : 0;
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
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
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
      <div className="flex items-center gap-3 flex-wrap">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-status-counts">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Care Plans by Status
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {Object.values(statusCounts).reduce((a, b) => a + b, 0)} total
            </Badge>
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

        <Card data-testid="card-tcm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              TCM Compliance Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted/50" data-testid="tcm-total-sent">
                <p className="text-sm text-muted-foreground">Patients with Care Plans Sent</p>
                <p className="text-2xl font-bold">{tcm.totalPatientsSent}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-md bg-muted/50" data-testid="tcm-99495">
                  <p className="text-sm text-muted-foreground">CPT 99495 Eligible</p>
                  <p className="text-xs text-muted-foreground mb-1">2+ check-ins completed</p>
                  <p className="text-lg font-semibold">{tcm.eligible99495}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50" data-testid="tcm-99496">
                  <p className="text-sm text-muted-foreground">CPT 99496 Eligible</p>
                  <p className="text-xs text-muted-foreground mb-1">Check-in within 48h</p>
                  <p className="text-lg font-semibold">{tcm.eligible99496}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
