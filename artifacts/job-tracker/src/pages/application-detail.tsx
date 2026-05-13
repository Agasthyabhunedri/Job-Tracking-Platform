import { useParams, useLocation } from "wouter";
import { useGetApplication, useUpdateApplicationStatus, useDeleteApplication, useAnalyzeApplication, getGetApplicationQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, MapPin, DollarSign, Calendar, ExternalLink, Trash2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const appId = parseInt(id, 10);
  
  const { data: app, isLoading } = useGetApplication(appId, {
    query: { enabled: !isNaN(appId), queryKey: getGetApplicationQueryKey(appId) }
  });
  
  const { data: analysis, isLoading: isLoadingAnalysis, refetch: runAnalysis, isFetching: isAnalyzing } = useAnalyzeApplication(appId, {
    query: { enabled: false }
  });

  const updateStatus = useUpdateApplicationStatus();
  const deleteApp = useDeleteApplication();

  if (isNaN(appId)) return <div>Invalid ID</div>;

  const handleStatusChange = (newStatus: string) => {
    updateStatus.mutate({
      id: appId,
      data: { status: newStatus as any }
    }, {
      onSuccess: (updatedData) => {
        queryClient.setQueryData(getGetApplicationQueryKey(appId), updatedData);
        toast({ title: "Status updated", description: `Application marked as ${newStatus}` });
      }
    });
  };

  const handleDelete = () => {
    deleteApp.mutate({ id: appId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["applications"] });
        toast({ title: "Application deleted" });
        setLocation("/applications");
      }
    });
  };

  if (isLoading) {
    return (
      <PageTransition className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="col-span-2 h-64" />
          <Skeleton className="col-span-1 h-64" />
        </div>
      </PageTransition>
    );
  }

  if (!app) return <div>Application not found</div>;

  return (
    <PageTransition className="space-y-6">
      <Link href="/applications" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Applications
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{app.jobTitle}</h1>
            <Badge className="text-sm px-3 py-1" variant="secondary">{app.status}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground mt-2">
            {app.companyName && <span className="flex items-center gap-1"><Building2 className="w-4 h-4" /> {app.companyName}</span>}
            {app.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {app.location}</span>}
            {app.salary && <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" /> {app.salary}</span>}
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Applied {app.appliedAt ? format(new Date(app.appliedAt), "MMM d, yyyy") : "Unknown"}</span>
          </div>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <Select value={app.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Update Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="screening">Screening</SelectItem>
              <SelectItem value="interview">Interview</SelectItem>
              <SelectItem value="offer">Offer</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon"><Trash2 className="w-4 h-4" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Application</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this application? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {app.jobUrl && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Job Posting</h4>
                  <a href={app.jobUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                    {app.jobUrl} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {app.notes && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Notes</h4>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-4 rounded-md border">{app.notes}</p>
                </div>
              )}
              {!app.jobUrl && !app.notes && (
                <p className="text-muted-foreground text-sm italic">No additional details provided.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Sparkles className="w-5 h-5" /> AI Analysis
                  </CardTitle>
                  <CardDescription>Get insights and next steps for this application</CardDescription>
                </div>
                <Button 
                  onClick={() => runAnalysis()} 
                  disabled={isAnalyzing}
                  variant={analysis ? "outline" : "default"}
                >
                  {isAnalyzing ? "Analyzing..." : analysis ? "Refresh Analysis" : "Analyze Application"}
                </Button>
              </div>
            </CardHeader>
            {analysis && (
              <CardContent className="pt-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-4 border-primary/20">
                    <span className="text-2xl font-bold text-primary">{analysis.score}</span>
                    <span className="text-xs text-muted-foreground">Match</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-lg">Application Score</h3>
                    <p className="text-sm text-muted-foreground">Based on industry standards and typical response rates.</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500"/> Suggestions</h4>
                    <ul className="space-y-2">
                      {analysis.suggestions.map((s, i) => (
                        <li key={i} className="text-sm bg-muted/50 p-2 rounded border border-border/50">{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-orange-500"/> Next Steps</h4>
                    <ul className="space-y-2">
                      {analysis.nextSteps.map((s, i) => (
                        <li key={i} className="text-sm bg-muted/50 p-2 rounded border border-border/50">{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            )}
            {!analysis && !isAnalyzing && (
              <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
                Run an AI analysis to get personalized advice for this job application.
              </CardContent>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative border-l ml-3 space-y-6">
                <div className="relative pl-6">
                  <div className="absolute w-3 h-3 bg-primary rounded-full -left-[6.5px] top-1.5 ring-4 ring-background" />
                  <p className="text-sm font-medium">Applied</p>
                  <p className="text-xs text-muted-foreground">{app.appliedAt ? format(new Date(app.appliedAt), "MMM d, yyyy") : "Unknown"}</p>
                </div>
                <div className="relative pl-6 opacity-50">
                  <div className="absolute w-3 h-3 bg-muted border-2 border-muted-foreground rounded-full -left-[6.5px] top-1.5 ring-4 ring-background" />
                  <p className="text-sm font-medium">Last Updated</p>
                  <p className="text-xs text-muted-foreground">{app.updatedAt ? format(new Date(app.updatedAt), "MMM d, yyyy") : "Unknown"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
