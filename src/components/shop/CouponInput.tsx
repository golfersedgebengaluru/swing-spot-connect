import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Tag } from "lucide-react";
import { useValidateCoupon, ValidateCouponResult, calculateDiscount } from "@/hooks/useCoupons";
import { useDefaultCurrency } from "@/hooks/useCurrency";

interface CouponInputProps {
  orderTotal: number;
  onApply: (result: ValidateCouponResult, discountAmount: number) => void;
  onRemove: () => void;
  appliedCoupon: ValidateCouponResult | null;
}

export function CouponInput({ orderTotal, onApply, onRemove, appliedCoupon }: CouponInputProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const validateCoupon = useValidateCoupon();
  const { format: fmt } = useDefaultCurrency();

  const handleApply = async () => {
    if (!code.trim()) return;
    setError("");
    try {
      const result = await validateCoupon.mutateAsync(code);
      if (result.valid) {
        const discount = calculateDiscount(result, orderTotal);
        onApply(result, discount);
        setCode("");
      } else {
        setError(result.error || "Invalid coupon code");
      }
    } catch (err: any) {
      setError(err.message || "Failed to validate coupon");
    }
  };

  if (appliedCoupon) {
    const discount = calculateDiscount(appliedCoupon, orderTotal);
    return (
      <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <span className="font-mono text-sm font-medium text-primary">{appliedCoupon.code}</span>
          <Badge variant="secondary" className="text-xs">
            {appliedCoupon.discount_type === "percentage"
              ? `${appliedCoupon.discount_value}% off`
              : `${fmt(appliedCoupon.discount_value!)} off`}
          </Badge>
          <span className="text-sm text-primary font-medium">−{fmt(discount)}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          placeholder="Enter coupon code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleApply()}
          maxLength={20}
          className="font-mono"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleApply}
          disabled={!code.trim() || validateCoupon.isPending}
        >
          {validateCoupon.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
