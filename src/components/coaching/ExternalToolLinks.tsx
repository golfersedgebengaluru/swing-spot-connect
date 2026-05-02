import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolLink } from "@/hooks/useCoaching";

interface Props {
  // New: arrays of {url, label}
  onformLinks?: ToolLink[] | null;
  sportsboxLinks?: ToolLink[] | null;
  superspeedLinks?: ToolLink[] | null;
  otherLinks?: ToolLink[] | null;
  // Legacy fallbacks (single URL) — used when arrays are empty
  onform?: string | null;
  sportsbox?: string | null;
  superspeed?: string | null;
  other?: string | null;
  otherLabel?: string | null;
  size?: "sm" | "default";
}

function normalize(arr: ToolLink[] | null | undefined, fallbackUrl?: string | null, fallbackLabel?: string | null): ToolLink[] {
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.filter((l) => l && l.url && l.url.trim());
  }
  if (fallbackUrl && fallbackUrl.trim()) {
    return [{ url: fallbackUrl, label: fallbackLabel || "" }];
  }
  return [];
}

export function ExternalToolLinks({
  onformLinks,
  sportsboxLinks,
  superspeedLinks,
  otherLinks,
  onform,
  sportsbox,
  superspeed,
  other,
  otherLabel,
  size = "sm",
}: Props) {
  const groups: { key: string; defaultLabel: string; links: ToolLink[] }[] = [
    { key: "onform", defaultLabel: "Onform", links: normalize(onformLinks, onform) },
    { key: "sportsbox", defaultLabel: "Sportsbox AI", links: normalize(sportsboxLinks, sportsbox) },
    { key: "superspeed", defaultLabel: "Superspeed", links: normalize(superspeedLinks, superspeed) },
    { key: "other", defaultLabel: "Other link", links: normalize(otherLinks, other, otherLabel) },
  ];

  const total = groups.reduce((n, g) => n + g.links.length, 0);
  if (!total) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {groups.flatMap((g) =>
        g.links.map((l, i) => (
          <Button key={`${g.key}-${i}`} asChild size={size} variant="outline" className="h-9">
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {l.label?.trim() ? `${g.defaultLabel}: ${l.label}` : g.defaultLabel}
            </a>
          </Button>
        ))
      )}
    </div>
  );
}
