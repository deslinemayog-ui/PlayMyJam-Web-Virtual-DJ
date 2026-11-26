import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Provider } from 'react-redux';
import { store } from './store';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Index from "./pages/Index";

const VirtualDJ = lazy(() => import("./pages/VirtualDJ"));
const PerformanceTest = lazy(() => import("./components/test/PerformanceTest"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const SmartTaskPrivacy = lazy(() => import("./pages/smarttaskprivacy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LoginModal = lazy(() => import("./components/LoginModal"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen bg-gradient-to-br from-[#222240] via-[#3a3a6a] to-[#222240] flex items-center justify-center">
    <div className="w-7 h-7 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
  </div>
);

const LazyLoginModal = () => {
  const { showLoginModal } = useAuth();
  if (!showLoginModal) return null;
  return (
    <Suspense fallback={null}>
      <LoginModal />
    </Suspense>
  );
};

const App = () => (
  <Provider store={store}>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/virtual-dj" element={<VirtualDJ />} />
                <Route path="/performance-test" element={<PerformanceTest />} />
                <Route path="/terms" element={<TermsAndConditions />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/smarttaskprivacy" element={<SmartTaskPrivacy />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <LazyLoginModal />
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  </Provider>
);

export default App;
