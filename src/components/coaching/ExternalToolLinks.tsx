import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onform?: string | null;
  sportsbox?: string | null;
  superspeed?: string | null;
  other?: string | null;
  otherLabel?: string | null;
  size?: "sm" | "default";
}

export function ExternalToolLinks({
  onform,
  sportsbox,
  superspeed,
  other,
  otherLabel,
  size = "sm",
}: Props) {
  const items: { key: string; label: string; url: string }[] = [];
  if (onform) items.push({ key: "onform", label: "Onform", url: onform });
  if (sportsbox) items.push({ key: "sportsbox", label: "Sportsbox AI", url: sportsbox });
  if (superspeed) items.push({ key: "superspeed", label: "Superspeed", url: superspeed });
  if (other) items.push({ key: "other", label: otherLabel?.trim() || "Other link", url: other });

  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <Button key={t.key} asChild size={size} variant="outline" className="h-9">
          <a href={t.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {t.label}
          </a>
        </Button>
      ))}
    </div>
  );
}
