import { useGetAnalyticsSummary, useGetApplicationPipeline, useListApplications } from "@workspace/api-client-react";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, Building2, TrendingUp, Clock, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary();
  const { data: pipeline, isLoading: isLoadingPipeline } = useGetApplicationPipeline();
  const { data: recentApps, isLoading: isLoadingRecent } = useListApplications({ query: { queryKey: ["applications", "recent"] } });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "applied": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "screening": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "interview": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "offer": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "rejected": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "withdrawn": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">Track your pipeline and recent activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{summary?.totalApplications || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              +{summary?.thisWeek || 0} this week
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Pipeline</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{summary?.activeApplications || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Currently in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interview Rate</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{summary?.interviewRate ? `${(summary.interviewRate * 100).toFixed(1)}%` : "0%"}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Applications to interviews
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{summary?.avgResponseDays || 0} days</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              From applied to first contact
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Pipeline Health</CardTitle>
            <CardDescription>Current status of all applications</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingPipeline ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {pipeline?.map((stage) => (
                  <div key={stage.status} className="flex items-center">
                    <div className="w-32 text-sm font-medium">{stage.label || stage.status}</div>
                    <div className="flex-1 ml-4">
                      <div className="h-4 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-500 ease-in-out" 
                          style={{ width: `${Math.max(5, (stage.count / (summary?.totalApplications || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-12 text-right text-sm font-medium">{stage.count}</div>
                  </div>
                ))}
                {pipeline?.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">No applications yet</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Applications</CardTitle>
              <CardDescription>Your latest job submissions</CardDescription>
            </div>
            <Link href="/applications" className="text-sm font-medium text-primary hover:underline flex items-center">
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoadingRecent ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {recentApps?.slice(0, 5).map((app) => (
                  <Link key={app.id} href={`/applications/${app.id}`}>
                    <div className="flex flex-col gap-1 p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer group">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm truncate">{app.jobTitle}</span>
                        <Badge variant="secondary" className={getStatusColor(app.status)}>
                          {app.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="truncate">{app.companyName || "Unknown Company"}</span>
                        <span>{format(new Date(app.createdAt), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                  </Link>
                ))}
                {(!recentApps || recentApps.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">No applications yet. Go to Applications to add one.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
