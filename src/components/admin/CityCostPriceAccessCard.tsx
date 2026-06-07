import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAllCities } from "@/hooks/useBookings";
import { useCityCostPriceAccess, useSetCityCostPriceAccess } from "@/hooks/useCostPrice";
import { useAdmin } from "@/hooks/useAdmin";

export function CityCostPriceAccessCard() {
  const { isAdmin } = useAdmin();
  const { data: cities, isLoading: citiesLoading } = useAllCities();
  const { data: access, isLoading: accessLoading } = useCityCostPriceAccess();
  const setAccess = useSetCityCostPriceAccess();
  const { toast } = useToast();

  if (!isAdmin) return null;
  if (citiesLoading || accessLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  const handleToggle = (city: string, checked: boolean) => {
    setAccess.mutate(
      { city, enabled: checked },
      {
        onSuccess: () => toast({ title: "Updated", description: `Cost price visibility for ${city} ${checked ? "enabled" : "disabled"} for site admins.` }),
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Cost Price Visibility (per City)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          When enabled for a city, site admins assigned to that city can view and edit cost prices for products in that city. Master admins always have full access.
        </p>
        {(cities ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">No cities found.</p>
        )}
        {(cities ?? []).map((city) => (
          <div key={city} className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{city}</p>
            <Switch
              checked={access?.[city] ?? false}
              onCheckedChange={(checked) => handleToggle(city, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
