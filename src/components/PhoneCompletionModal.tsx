import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LogOut } from "lucide-react";

interface PhoneCompletionModalProps {
  open: boolean;
  userId: string;
  onComplete: () => void;
}

export function PhoneCompletionModal({ open, userId, onComplete }: PhoneCompletionModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const validate = () => {
    const digits = phone.replace(/[^\d]/g, "");
    if (digits.length < 7) {
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
      onComplete();
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
            <div className="mt-1">
              <PhoneInput
                id="phone-input"
                value={phone}
                onChange={setPhone}
              />
            </div>
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
