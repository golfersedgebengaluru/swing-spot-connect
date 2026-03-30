import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { FeaturesSection } from "@/components/home/FeaturesSection";
import { CTASection } from "@/components/home/CTASection";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const { hasAdminAccess, loading: adminLoading } = useAdmin();

  useEffect(() => {
    if (!loading && !adminLoading && user) {
      navigate(hasAdminAccess ? "/admin" : "/dashboard");
    }
  }, [user, loading, adminLoading, hasAdminAccess, navigate]);
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
