import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetAnalyticsSummary, useGetWeeklyApplications, useGetApplicationPipeline, useGetTopCompanies } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";

export default function Analytics() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary();
  const { data: weekly, isLoading: isLoadingWeekly } = useGetWeeklyApplications();
  const { data: pipeline, isLoading: isLoadingPipeline } = useGetApplicationPipeline();
  const { data: topCompanies, isLoading: isLoadingTop } = useGetTopCompanies();

  const COLORS = ['#2563eb', '#8b5cf6', '#eab308', '#22c55e', '#ef4444', '#6b7280'];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Deep dive into your job search metrics.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>Application Velocity</CardTitle>
            <CardDescription>Applications sent over the last 8 weeks</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingWeekly ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline Breakdown</CardTitle>
            <CardDescription>Current status distribution</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center">
            {isLoadingPipeline ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pipeline?.filter(p => p.count > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="label"
                  >
                    {pipeline?.filter(p => p.count > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Companies</CardTitle>
            <CardDescription>Where you've applied most</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTop ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="w-full h-10" />)}
              </div>
            ) : topCompanies?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No company data yet
              </div>
            ) : (
              <div className="space-y-4">
                {(Array.isArray(topCompanies) ? topCompanies : [])?.slice(0, 5).map((tc, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="font-medium text-sm">{tc.companyName}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-semibold">{tc.count} apps</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion Metrics</CardTitle>
            <CardDescription>How well you convert across stages</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col justify-center space-y-6">
            {isLoadingSummary ? <Skeleton className="w-full h-48" /> : (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Applied → Interview</span>
                    <span className="text-muted-foreground">{summary?.interviewRate ? `${(summary.interviewRate * 100).toFixed(1)}%` : "0%"}</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${(summary?.interviewRate || 0) * 100}%` }} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Interview → Offer</span>
                    <span className="text-muted-foreground">{summary?.offerRate ? `${(summary.offerRate * 100).toFixed(1)}%` : "0%"}</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${(summary?.offerRate || 0) * 100}%` }} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Rejection Rate</span>
                    <span className="text-muted-foreground">{summary?.rejectionRate ? `${(summary.rejectionRate * 100).toFixed(1)}%` : "0%"}</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-red-500" style={{ width: `${(summary?.rejectionRate || 0) * 100}%` }} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
