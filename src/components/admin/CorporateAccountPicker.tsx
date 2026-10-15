import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useCorporateAccounts } from "@/hooks/useCorporateAccounts";

export function CorporateAccountPicker({ value, onChange, disabled = false }: {
  value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data: accounts = [], isLoading, error } = useCorporateAccounts();
  return <div className="space-y-2">
    <Input aria-label="Search corporate accounts" placeholder="Search corporate accounts…" value={search} onChange={e => setSearch(e.target.value)} disabled={disabled} />
    <div className="max-h-48 overflow-y-auto space-y-2 border border-border rounded-md p-3">
      {isLoading ? <p className="text-sm text-muted-foreground">Loading accounts…</p> : error ? <p className="text-sm text-destructive">Could not load corporate accounts.</p> : accounts.filter(a => a.name.toLowerCase().includes(search.toLowerCase())).map(a =>
        <Label key={a.id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={value.includes(a.id)} disabled={disabled} onCheckedChange={checked => onChange(checked ? [...value, a.id] : value.filter(id => id !== a.id))} />
          <span className="break-words">{a.name}</span>
        </Label>)}
      {!isLoading && !error && accounts.length === 0 && <p className="text-sm text-muted-foreground">No active corporate accounts.</p>}
    </div>
  </div>;
}