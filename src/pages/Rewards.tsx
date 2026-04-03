import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Loader2 } from "lucide-react";
import { useUserPoints } from "@/hooks/usePoints";
import { useAuth } from "@/contexts/AuthContext";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { PointsSummaryCard } from "@/components/rewards/PointsSummaryCard";
import { ProgressCard } from "@/components/rewards/ProgressCard";
import { RewardsCatalogue } from "@/components/rewards/RewardsCatalogue";
import { PointsHistory } from "@/components/rewards/PointsHistory";
import { EarnMethodsCard } from "@/components/rewards/EarnMethodsCard";
import { GiftedRewardsCard } from "@/components/rewards/GiftedRewardsCard";

export default function Rewards() {
  const { user } = useAuth();
  const { data: currentPoints = 0, isLoading: loadingPoints } = useUserPoints();
  const { data: visibility, isLoading: loadingVis } = usePageVisibility();

  const edgeEnabled = visibility?.["dashboard_edge_rewards_visible"] ?? true;

  if (loadingVis) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!edgeEnabled) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex-1 py-8">
          <div className="container mx-auto px-4 text-center py-20">
            <h1 className="font-display text-3xl font-bold text-foreground">Rewards</h1>
            <p className="mt-2 text-muted-foreground">The rewards program is currently not available.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">Rewards</h1>
            <p className="mt-1 text-muted-foreground">Earn points and redeem exclusive perks</p>
          </div>

          {/* Points Summary */}
          <PointsSummaryCard currentPoints={currentPoints} loadingPoints={loadingPoints} />

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {/* Left column: Catalogue + Earning rules */}
            <div className="lg:col-span-2 space-y-6">
              <RewardsCatalogue currentPoints={currentPoints} />
              <EarnMethodsCard />
            </div>

            {/* Right column: Progress + History */}
            <div className="space-y-6">
              <ProgressCard />
              <PointsHistory />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
