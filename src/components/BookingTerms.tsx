import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { usePageContent } from "@/hooks/usePageContent";

interface BookingTermsProps {
  slug: "booking-terms" | "package-terms";
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}

export function BookingTerms({ slug, accepted, onAcceptedChange }: BookingTermsProps) {
  const { data: page, isLoading } = usePageContent(slug);

  if (isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  if (!page) return null;

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground max-h-48 overflow-y-auto prose prose-sm dark:prose-invert prose-headings:text-foreground prose-headings:text-sm prose-headings:font-semibold prose-p:my-1 prose-ul:my-1 prose-li:my-0"
        dangerouslySetInnerHTML={{ __html: page.content }}
      />
      <div className="flex items-start gap-2">
        <Checkbox
          id={`accept-${slug}`}
          checked={accepted}
          onCheckedChange={(checked) => onAcceptedChange(checked === true)}
        />
        <Label htmlFor={`accept-${slug}`} className="text-sm leading-snug cursor-pointer">
          I have read and agree to the {page.title}
        </Label>
      </div>
    </div>
  );
}
