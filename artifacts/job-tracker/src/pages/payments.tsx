import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Sparkles, FileText, Calendar } from "lucide-react";
import { useListPlans, useGetSubscription, useUpdateSubscription, useGetBillingHistory } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Payments() {
  const { data: plans, isLoading: isLoadingPlans } = useListPlans();
  const { data: subscription, isLoading: isLoadingSub } = useGetSubscription();
  const { data: billingHistory, isLoading: isLoadingBilling } = useGetBillingHistory();
  
  const updateSub = useUpdateSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubscribe = (planId: string) => {
    updateSub.mutate({ data: { planId } }, {
      onSuccess: () => {
        toast({ title: "Subscription updated", description: "Your plan has been changed successfully." });
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
      },
      onError: (err) => {
        toast({ title: "Update failed", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Billing & Plans</h1>
        <p className="text-muted-foreground">Manage your subscription and billing details.</p>
      </div>

      <Tabs defaultValue="plans" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
          <TabsTrigger value="plans">Subscription Plans</TabsTrigger>
          <TabsTrigger value="history">Billing History</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-8">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" /> Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingSub ? <Skeleton className="h-6 w-48" /> : (
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold">{subscription?.planName || "Free Tier"}</span>
                  <Badge variant={subscription?.status === 'active' ? "default" : "secondary"}>
                    {subscription?.status || 'Active'}
                  </Badge>
                  {subscription?.currentPeriodEnd && (
                    <span className="text-sm text-muted-foreground ml-auto flex items-center gap-1">
                      <Calendar className="w-4 h-4" /> Renews {format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoadingPlans ? (
              [1,2,3].map(i => <Skeleton key={i} className="h-96 w-full" />)
            ) : plans?.map(plan => (
              <Card key={plan.id} className={`relative flex flex-col ${plan.popular ? 'border-primary shadow-md scale-105 z-10' : ''}`}>
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Most Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>
                    <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                    <span className="text-muted-foreground">/{plan.interval}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <p className="text-sm font-medium">Includes:</p>
                  <ul className="space-y-2">
                    {plan.features?.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    variant={subscription?.planId === plan.id ? "outline" : plan.popular ? "default" : "secondary"}
                    disabled={subscription?.planId === plan.id || updateSub.isPending}
                    onClick={() => handleSubscribe(plan.id)}
                  >
                    {subscription?.planId === plan.id ? "Current Plan" : "Upgrade"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>View your past invoices and receipts.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingBilling ? (
                <div className="space-y-4">
                  {[1,2,3].map(i => <Skeleton key={i} className="w-full h-12" />)}
                </div>
              ) : billingHistory?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  No billing history available.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingHistory?.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{format(new Date(record.createdAt), "MMM d, yyyy")}</TableCell>
                        <TableCell>{record.description}</TableCell>
                        <TableCell>
                          <Badge variant={record.status === 'paid' ? "default" : "secondary"} className="capitalize">
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">${record.amount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageTransition>
  );
}
