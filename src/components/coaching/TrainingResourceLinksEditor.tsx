import { Link2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ToolLink } from "@/hooks/useCoaching";

type ResourceLinkGroup = {
  title: string;
  addLabel: string;
  links: ToolLink[];
  onChange: (next: ToolLink[]) => void;
  hint?: string;
};

function ResourceLinkGroupEditor({ title, addLabel, links, onChange, hint }: ResourceLinkGroup) {
  const update = (index: number, patch: Partial<ToolLink>) => {
    onChange(links.map((link, current) => current === index ? { ...link, ...patch } : link));
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{title}</Label>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...links, { url: "", label: "" }])}>
          <Plus className="mr-1 h-3.5 w-3.5" />{addLabel}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {links.map((link, index) => (
        <div key={`${title}-${index}`} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_12rem_auto]">
          <Input value={link.url} onChange={(event) => update(index, { url: event.target.value })} placeholder="https://…" aria-label={`${title} URL ${index + 1}`} />
          <Input value={link.label ?? ""} onChange={(event) => update(index, { label: event.target.value })} placeholder="Label (optional)" className="col-span-1" aria-label={`${title} label ${index + 1}`} />
          <Button type="button" size="icon" variant="ghost" onClick={() => onChange(links.filter((_, current) => current !== index))} aria-label={`Remove ${title} link ${index + 1}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function TrainingResourceLinksEditor({
  onformLinks,
  setOnformLinks,
  sportsboxLinks,
  setSportsboxLinks,
  superspeedLinks,
  setSuperspeedLinks,
  otherLinks,
  setOtherLinks,
}: {
  onformLinks: ToolLink[];
  setOnformLinks: (links: ToolLink[]) => void;
  sportsboxLinks: ToolLink[];
  setSportsboxLinks: (links: ToolLink[]) => void;
  superspeedLinks: ToolLink[];
  setSuperspeedLinks: (links: ToolLink[]) => void;
  otherLinks: ToolLink[];
  setOtherLinks: (links: ToolLink[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" />Resources</div>
      <ResourceLinkGroupEditor title="Onform links" addLabel="Add Onform link" links={onformLinks} onChange={setOnformLinks} />
      <ResourceLinkGroupEditor title="Sportsbox AI links" addLabel="Add Sportsbox link" links={sportsboxLinks} onChange={setSportsboxLinks} />
      <ResourceLinkGroupEditor title="Superspeed links" addLabel="Add Superspeed link" links={superspeedLinks} onChange={setSuperspeedLinks} />
      <ResourceLinkGroupEditor title="Other links" addLabel="Add other link" links={otherLinks} onChange={setOtherLinks} hint="Any external resource, such as Google Drive or YouTube." />
    </div>
  );
}