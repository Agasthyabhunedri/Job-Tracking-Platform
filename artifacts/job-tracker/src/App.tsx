import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AnimatePresence } from "framer-motion";

// Pages
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Applications from "@/pages/applications";
import ApplicationDetail from "@/pages/application-detail";
import Companies from "@/pages/companies";
import Analytics from "@/pages/analytics";
import Payments from "@/pages/payments";
import Notifications from "@/pages/notifications";
import AI from "@/pages/ai";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <AnimatePresence mode="wait">
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        
        <Route path="/">
          <ProtectedRoute component={Dashboard} />
        </Route>
        
        <Route path="/applications">
          <ProtectedRoute component={Applications} />
        </Route>
        
        <Route path="/applications/:id">
          <ProtectedRoute component={ApplicationDetail} />
        </Route>
        
        <Route path="/companies">
          <ProtectedRoute component={Companies} />
        </Route>
        
        <Route path="/analytics">
          <ProtectedRoute component={Analytics} />
        </Route>
        
        <Route path="/payments">
          <ProtectedRoute component={Payments} />
        </Route>
        
        <Route path="/notifications">
          <ProtectedRoute component={Notifications} />
        </Route>
        
        <Route path="/ai">
          <ProtectedRoute component={AI} />
        </Route>
        
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
