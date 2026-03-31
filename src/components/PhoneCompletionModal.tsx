import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PhoneCompletionModalProps {
  open: boolean;
  userId: string;
}

export function PhoneCompletionModal({ open, userId }: PhoneCompletionModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const validate = () => {
    if (!phone.trim()) {
      setError("Phone number is required");
      return false;
    }
    if (phone.trim().length < 7) {
      setError("Please enter a valid phone number");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ phone: phone.trim() })
        .eq("user_id", userId);

      if (dbError) throw dbError;

      toast({ title: "Phone number saved", description: "Thank you!" });
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save phone number",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md [&>button[class*='absolute']]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add Your Phone Number</DialogTitle>
          <DialogDescription>
            A phone number is required for booking confirmations and important notifications.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label htmlFor="phone-input">Phone Number</Label>
            <Input
              id="phone-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="mt-1"
            />
            {error && (
              <p className="text-sm text-destructive mt-1">{error}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
