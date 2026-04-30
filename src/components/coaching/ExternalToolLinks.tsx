import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onform?: string | null;
  sportsbox?: string | null;
  superspeed?: string | null;
  size?: "sm" | "default";
}

const tools = [
  { key: "onform" as const, label: "Onform" },
  { key: "sportsbox" as const, label: "Sportsbox AI" },
  { key: "superspeed" as const, label: "Superspeed" },
];

export function ExternalToolLinks({ onform, sportsbox, superspeed, size = "sm" }: Props) {
  const map = { onform, sportsbox, superspeed };
  const present = tools.filter((t) => map[t.key]);
  if (!present.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {present.map((t) => (
        <Button
          key={t.key}
          asChild
          size={size}
          variant="outline"
          className="h-9"
        >
          <a href={map[t.key] as string} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {t.label}
          </a>
        </Button>
      ))}
    </div>
  );
}
