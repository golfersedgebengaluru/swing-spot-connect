import { useState } from "react";
import { Building2, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCorporateAccounts, useAssignProfileToCorporate } from "@/hooks/useCorporateAccounts";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Props {
  profileId: string;
  profileLabel?: string;
}

export function UserCorporateAssignment({ profileId, profileLabel }: Props) {
  const { toast } = useToast();
  const { data: accounts } = useCorporateAccounts();
  const assign = useAssignProfileToCorporate();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string>("");

  const { data: current, refetch } = useQuery({
    queryKey: ["profile_corporate", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("corporate_account_id, billing_mode")
        .eq("id", profileId)
        .maybeSingle();
      return data;
    },
  });

  const currentAccount = (accounts ?? []).find((a) => a.id === current?.corporate_account_id);

  const save = async () => {
    try {
      await assign.mutateAsync({
        profileId,
        corporateAccountId: selected === "__none__" ? null : selected || null,
      });
      toast({ title: "Updated", description: selected === "__none__" || !selected ? "Removed from corporate billing." : "Linked to corporate account." });
      setEditing(false);
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
        <Building2 className="h-4 w-4" /> Corporate Billing
      </h4>
      {!editing ? (
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div className="text-sm">
            {currentAccount ? (
              <div className="flex items-center gap-2">
                <span className="font-medium">{currentAccount.name}</span>
                <Badge variant="default" className="text-[10px]">Monthly Invoice</Badge>
              </div>
            ) : (
              <span className="text-muted-foreground">Standard billing (pay-per-session)</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => { setSelected(current?.corporate_account_id ?? "__none__"); setEditing(true); }}>
            Change
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Standard (no corporate) —</SelectItem>
              {(accounts ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" onClick={save} disabled={assign.isPending}>
            {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Members of a corporate account skip per-session payment; sessions roll up into a monthly consolidated invoice.
      </p>
    </div>
  );
}
