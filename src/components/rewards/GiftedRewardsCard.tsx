import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Loader2, CheckCircle2 } from "lucide-react";
import { useMyGiftedRewards, useClaimGift } from "@/hooks/useGiftedRewards";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export function GiftedRewardsCard() {
  const { user } = useAuth();
  const { data: gifts, isLoading } = useMyGiftedRewards(user?.id);
  const claimGift = useClaimGift();
  const { toast } = useToast();

  const handleClaim = async (id: string, name: string) => {
    try {
      await claimGift.mutateAsync(id);
      toast({ title: "🎁 Gift Claimed!", description: `You claimed "${name}". Show this to staff to redeem.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-elegant">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!gifts?.length) return null;

  return (
    <Card className="shadow-elegant border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <Gift className="h-5 w-5 text-primary" />
          Your Gifts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {gifts.map((gift: any) => (
            <div
              key={gift.id}
              className={`rounded-xl border p-4 transition-all ${
                gift.status === "pending"
                  ? "border-primary/30 bg-primary/5"
                  : "border-border opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-foreground">{gift.reward_name}</h4>
                    <Badge variant={gift.status === "claimed" ? "default" : gift.status === "expired" ? "destructive" : "secondary"}>
                      {gift.status === "claimed" ? "Claimed" : gift.status === "expired" ? "Expired" : "Available"}
                    </Badge>
                  </div>
                  {gift.reward_description && (
                    <p className="text-sm text-muted-foreground mt-1">{gift.reward_description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {gift.gift_type === "auto" ? "Auto-awarded" : "Gift from admin"} · {new Date(gift.created_at).toLocaleDateString()}
                  </p>
                </div>
                {gift.status === "pending" && (
                  <Button size="sm" onClick={() => handleClaim(gift.id, gift.reward_name)} disabled={claimGift.isPending}>
                    {claimGift.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                    Claim
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
