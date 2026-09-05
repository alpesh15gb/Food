/** Market Table design: a hospitality-led app shell with warm, crisp, action-focused UI. */
import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { canonicalPath } from "./lib/platform";
import Home from "./pages/Home";

// Storefront (Home) stays eager for fastest initial paint.
// All non-storefront routes are code-split so slow/low-end devices
// don't pay for Admin/Signup JS on first load.
const Admin = lazy(() => import("./pages/Admin"));
const SignupPage = lazy(() => import("./pages/Signup"));

function RouteFallback() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-[#f7f2eb]"
      aria-busy="true"
      aria-label="Loading page"
      role="status"
    >
      <div className="flex flex-col items-center gap-4">
        <span
          className="h-10 w-10 animate-spin rounded-full border-4 border-[#e4d5c8] border-t-[#c84630]"
          aria-hidden="true"
        />
        <p className="text-sm font-bold text-[#816252]">Loading…</p>
      </div>
    </div>
  );
}

/**
 * Normalize the URL once per navigation (trailing slashes, duplicate
 * slashes, slug case) with a replace — no extra history entries, so the
 * back button skips the un-normalized URL. Without this, `/admin/` or
 * `/9House` would fall through to `/:slug` and render a storefront lookup
 * for "admin" instead of the admin desk.
 */
function LocationNormalizer() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    const fixed = canonicalPath(location);
    if (fixed && fixed !== location) navigate(fixed, { replace: true });
  }, [location, navigate]);
  return null;
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <LocationNormalizer />
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
    </Suspense>
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
