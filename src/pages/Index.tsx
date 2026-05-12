import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { FeaturesSection } from "@/components/home/FeaturesSection";
import { CTASection } from "@/components/home/CTASection";
import { BookingHeroSection } from "@/components/home/BookingHeroSection";
import { BookingCTASection } from "@/components/home/BookingCTASection";
import { LeaguesLandingSection } from "@/components/home/LeaguesLandingSection";
import { useLandingMode } from "@/hooks/useLandingMode";


const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { hasAdminAccess, loading: adminLoading } = useAdmin();
  const { data: landingMode } = useLandingMode();

  useEffect(() => {
    if (!loading && !adminLoading && user) {
      const isContests = user.email?.toLowerCase().startsWith("contests@golfers-edge");
      navigate(hasAdminAccess || isContests ? "/admin" : "/dashboard");
    }
  }, [user, loading, adminLoading, hasAdminAccess, navigate]);

  const isBookingMode = landingMode === "booking";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        {isBookingMode ? (
          <>
            <BookingHeroSection />
            <BookingCTASection />
          </>
        ) : (
          <>
            <HeroSection />
            <FeaturesSection />
            <CTASection />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Index;
