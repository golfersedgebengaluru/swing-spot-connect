import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminRoute } from "@/components/AdminRoute";
import { CitySelectionModal } from "@/components/CitySelectionModal";
import { PageLoader } from "@/components/PageLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Events = lazy(() => import("./pages/Events"));
const Community = lazy(() => import("./pages/Community"));
const Shop = lazy(() => import("./pages/Shop"));
const Rewards = lazy(() => import("./pages/Rewards"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminSetup = lazy(() => import("./pages/AdminSetup"));
const Bookings = lazy(() => import("./pages/Bookings"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const PageView = lazy(() => import("./pages/PageView"));
const Leagues = lazy(() => import("./pages/Leagues"));
const Profile = lazy(() => import("./pages/Profile"));
const Coaching = lazy(() => import("./pages/Coaching"));
const CoachingSessionDetail = lazy(() => import("./pages/CoachingSessionDetail"));
const QuickCompetitionPublic = lazy(() => import("./pages/QuickCompetitionPublic"));
const QuickCompetitionJoin = lazy(() => import("./pages/QuickCompetitionJoin"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,     // 30 seconds
      gcTime: 5 * 60 * 1000,    // 5 minutes
      refetchOnWindowFocus: true,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CitySelectionModal />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<ErrorBoundary><Index /></ErrorBoundary>} />
              <Route path="/auth" element={<ErrorBoundary><Auth /></ErrorBoundary>} />
              <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
              <Route path="/leaderboard" element={<ErrorBoundary><Leaderboard /></ErrorBoundary>} />
              <Route path="/events" element={<ErrorBoundary><Events /></ErrorBoundary>} />
              <Route path="/community" element={<ErrorBoundary><Community /></ErrorBoundary>} />
              <Route path="/shop" element={<ErrorBoundary><Shop /></ErrorBoundary>} />
              <Route path="/rewards" element={<ErrorBoundary><Rewards /></ErrorBoundary>} />
              <Route path="/book" element={<ErrorBoundary><PublicBooking /></ErrorBoundary>} />
              <Route path="/bookings" element={<ErrorBoundary><Bookings /></ErrorBoundary>} />
              <Route path="/my-bookings" element={<ErrorBoundary><MyBookings /></ErrorBoundary>} />
              <Route path="/profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
              <Route path="/leagues" element={<ErrorBoundary><Leagues /></ErrorBoundary>} />
              <Route path="/coaching" element={<ErrorBoundary><Coaching /></ErrorBoundary>} />
              <Route path="/coaching/:sessionId" element={<ErrorBoundary><CoachingSessionDetail /></ErrorBoundary>} />
              <Route path="/admin/setup" element={<ErrorBoundary><AdminSetup /></ErrorBoundary>} />
              <Route path="/admin" element={<ErrorBoundary><AdminRoute><Admin /></AdminRoute></ErrorBoundary>} />
              <Route path="/qc/:id" element={<ErrorBoundary><QuickCompetitionPublic /></ErrorBoundary>} />
              <Route path="/qc/:id/join" element={<ErrorBoundary><QuickCompetitionJoin /></ErrorBoundary>} />
              <Route path="/page/:slug" element={<ErrorBoundary><PageView /></ErrorBoundary>} />
              <Route path="*" element={<ErrorBoundary><NotFound /></ErrorBoundary>} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
