import { useState } from "react";
import { Building2, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAssignProfileToCorporate, useProfileBillingInfo } from "@/hooks/useCorporateAccounts";
import { CorporateAccountPicker } from "./CorporateAccountPicker";

export function UserCorporateAssignment({ profileId }: { profileId: string; profileLabel?: string }) {
  const { toast } = useToast();
  const { data, isLoading, error } = useProfileBillingInfo(profileId);
  const assign = useAssignProfileToCorporate();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const save = async () => {
    try {
      await assign.mutateAsync({ profileId, accountIds: selected });
      setEditing(false);
      toast({ title: "Corporate memberships updated" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Could not save memberships", variant: "destructive" });
    }
  };
  return <div className="space-y-2">
    <h4 className="text-sm font-medium flex items-center gap-2"><Building2 className="h-4 w-4" />Corporate Billing</h4>
    {editing ? <>
      <CorporateAccountPicker value={selected} onChange={setSelected} disabled={assign.isPending} />
      <div className="flex gap-2 justify-end">
        <Button size="icon" title="Save memberships" onClick={save} disabled={assign.isPending}>{assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
        <Button size="icon" title="Cancel" variant="ghost" disabled={assign.isPending} onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
      </div>
    </> : <div className="flex items-center justify-between gap-3 border border-border rounded-md px-3 py-2">
      <span className="text-sm break-words">{isLoading ? "Loading…" : error ? "Could not load memberships" : data?.accounts.map(a => a.name).join(", ") || "Standard billing (pay-per-session)"}</span>
      <Button variant="outline" size="sm" disabled={isLoading || !!error} onClick={() => { setSelected(data?.accountIds ?? []); setEditing(true); }}>Change</Button>
    </div>}
  </div>;
}
