import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronRight } from "lucide-react";

interface ScrollableTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Minimum width before horizontal scrolling activates */
  minWidth?: string;
  /** Disable the swipe hint */
  hideHint?: boolean;
}

/**
 * Wraps wide tables with:
 *  - horizontal scroll on small screens
 *  - a thin always-visible scrollbar
 *  - a right-edge fade when more content is hidden
 *  - a "Swipe →" hint on mobile (auto-hides after first scroll)
 */
export const ScrollableTable = React.forwardRef<HTMLDivElement, ScrollableTableProps>(
  ({ className, children, minWidth = "650px", hideHint = false, ...props }, ref) => {
    const isMobile = useIsMobile();
    const innerRef = React.useRef<HTMLDivElement | null>(null);
    const [hasOverflow, setHasOverflow] = React.useState(false);
    const [scrolled, setScrolled] = React.useState(false);

    React.useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const check = () => setHasOverflow(el.scrollWidth > el.clientWidth + 2);
      check();
      const ro = new ResizeObserver(check);
      ro.observe(el);
      return () => ro.disconnect();
    }, [children]);

    const onScroll = () => {
      if (!scrolled) setScrolled(true);
    };

    const showHint = isMobile && hasOverflow && !scrolled && !hideHint;

    return (
      <div className={cn("relative w-full", className)} {...props}>
        <div
          ref={innerRef}
          onScroll={onScroll}
          className="w-full overflow-x-auto scrollable-table-scroll"
          style={{ scrollbarWidth: "thin" }}
        >
          <div style={{ minWidth }}>{children}</div>
        </div>

        {/* Right-edge fade gradient */}
        {hasOverflow && !scrolled && (
          <div
            className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent"
            aria-hidden
          />
        )}

        {/* Swipe hint */}
        {showHint && (
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-full bg-foreground/80 px-2 py-1 text-[10px] font-medium text-background shadow-md animate-pulse">
            Swipe <ChevronRight className="h-3 w-3" />
          </div>
        )}
      </div>
    );
  }
);
ScrollableTable.displayName = "ScrollableTable";
