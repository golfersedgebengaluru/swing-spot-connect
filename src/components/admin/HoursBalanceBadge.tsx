import { getHoursTone } from "@/lib/member-utils";
import { cn } from "@/lib/utils";

const toneClasses = {
  green: { pill: "bg-green-500/15 text-green-600 dark:text-green-400", dot: "bg-green-500" },
  amber: { pill: "bg-amber-500/15 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  red: { pill: "bg-red-500/15 text-red-600 dark:text-red-400", dot: "bg-red-500" },
};

export function HoursBalanceBadge({ remaining, className }: { remaining: number; className?: string }) {
  const classes = toneClasses[getHoursTone(remaining)];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", classes.pill, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", classes.dot)} />
      {remaining} hrs
    </span>
  );
}
