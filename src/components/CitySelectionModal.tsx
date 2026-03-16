import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { useUserProfile, useUpdatePreferredCity } from "@/hooks/useBookings";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export function CitySelectionModal() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useUserProfile();
  const updateCity = useUpdatePreferredCity();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && user && profile && !profile.preferred_city) {
      setOpen(true);
    }
  }, [isLoading, user, profile]);

  const handleSelect = async (city: string) => {
    try {
      await updateCity.mutateAsync(city);
      toast({ title: "City set!", description: `Your preferred city is now ${city}.` });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (!user || isLoading) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Select Your City
          </DialogTitle>
          <DialogDescription>
            Choose your preferred location for bay bookings. You can change this later in settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 pt-4">
          <Button
            variant="outline"
            className="h-24 flex-col gap-2 text-lg hover:bg-primary/10 hover:border-primary"
            onClick={() => handleSelect("Chennai")}
            disabled={updateCity.isPending}
          >
            <MapPin className="h-6 w-6" />
            Chennai
          </Button>
          <Button
            variant="outline"
            className="h-24 flex-col gap-2 text-lg hover:bg-primary/10 hover:border-primary"
            onClick={() => handleSelect("Bengaluru")}
            disabled={updateCity.isPending}
          >
            <MapPin className="h-6 w-6" />
            Bengaluru
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
