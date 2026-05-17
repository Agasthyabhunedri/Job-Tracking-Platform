import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGetAiRecommendations } from "@workspace/api-client-react";
import { Sparkles, ArrowRight, Zap, Target, Users, FileEdit } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function AI() {
  const { data: recommendations, isLoading } = useGetAiRecommendations();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      default: return '';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'follow_up': return <Target className="w-5 h-5 text-orange-500" />;
      case 'improve_resume': return <FileEdit className="w-5 h-5 text-blue-500" />;
      case 'networking': return <Users className="w-5 h-5 text-purple-500" />;
      default: return <Zap className="w-5 h-5 text-yellow-500" />;
    }
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AI Insights</h1>
        </div>
        <p className="text-muted-foreground">Smart recommendations to accelerate your job search.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [1,2,3,4,5].map(i => <Skeleton key={i} className="h-48 w-full" />)
        ) : recommendations?.length === 0 ? (
          <div className="col-span-full text-center py-12 border rounded-lg bg-card border-dashed">
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No recommendations yet</h3>
            <p className="text-muted-foreground">Add more applications to get AI-powered advice.</p>
          </div>
        ) : (
          (Array.isArray(recommandations) ? recommandations : [])?.map(rec => (
            <Card key={rec.id} className="relative overflow-hidden group hover:border-primary/50 transition-colors flex flex-col">
              <div className={`absolute top-0 inset-x-0 h-1 ${
                rec.priority === 'high' ? 'bg-red-500' : 
                rec.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
              }`} />
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="p-2 bg-muted rounded-md shrink-0">
                    {getIcon(rec.type)}
                  </div>
                  <Badge variant="outline" className={`uppercase tracking-wider text-[10px] ${getPriorityColor(rec.priority)}`}>
                    {rec.priority} priority
                  </Badge>
                </div>
                <CardTitle className="mt-4 text-lg leading-tight">{rec.title}</CardTitle>
                {rec.applicationTitle && (
                  <CardDescription className="font-medium text-primary">
                    For: {rec.applicationTitle} {rec.companyName && `at ${rec.companyName}`}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground">{rec.description}</p>
              </CardContent>
              {rec.applicationId && (
                <div className="p-4 pt-0 mt-auto">
                  <Link href={`/applications/${rec.applicationId}`}>
                    <Button variant="secondary" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      View Application <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </PageTransition>
  );
}
