/** Market Table design: a hospitality-led app shell with warm, crisp, action-focused UI. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import SignupPage from "./pages/Signup";

function Router() {
  return (
    <Switch>
      <Route path="/signup" component={SignupPage} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/:restaurantSlug" component={Admin} />
      <Route path="/admin/:restaurantSlug/:section" component={Admin} />
      <Route path="/" component={Home} />
      <Route path="/:slug/cart" component={Home} />
      <Route path="/:slug/checkout" component={Home} />
      <Route path="/:slug/confirmation" component={Home} />
      <Route path="/order/:number" component={Home} />
      <Route path="/:slug" component={Home} />
      <Route path="/:slug/:rest*" component={Home} />
      <Route component={Home} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
