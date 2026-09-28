import { Card, CardContent } from "@/components/ui/card";
import { PendingLink } from "@/components/ui/pending-link";

/** A small stat card used at the top of a list page — optionally acts as a
 * filter toggle for the list below when `href` is set. Shared by the
 * per-property units page and the portfolio-wide Service Charge Ledger module so
 * their summary tiles look and behave identically. */
export function SummaryTile({
  icon,
  value,
  label,
  sublabel,
  aside,
  progress,
  accent = "bg-slate-400",
  iconBg = "bg-slate-50 text-slate-600",
  href,
  active = false,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  sublabel?: string;
  /** Content pinned to the right edge of the tile (e.g. a bold area
   * breakdown) — keeps the tile as short as its neighbours. */
  aside?: React.ReactNode;
  /** 0–100: draws a thin progress bar along the tile's bottom edge. */
  progress?: number;
  /** Top accent bar color, e.g. "bg-emerald-500". */
  accent?: string;
  /** Icon badge background + text color, e.g. "bg-emerald-50 text-emerald-600". */
  iconBg?: string;
  /** When set, the whole tile acts as a filter toggle for the units below. */
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight">
          {value}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {label}
        </p>
        {sublabel && (
          <p className="text-[10px] leading-snug text-muted-foreground/80">
            {sublabel}
          </p>
        )}
      </div>
      {aside && (
        <div className="ml-auto shrink-0 border-l border-border/60 pl-3 text-right">
          {aside}
        </div>
      )}
    </>
  );

  return (
    <Card
      className={`relative overflow-hidden shadow-sm transition-shadow ${
        active
          ? "border-transparent ring-2 ring-primary/60"
          : "border-border/60"
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      {progress !== undefined && (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-slate-200">
          <span
            className="block h-full bg-[#23abb5]"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </span>
      )}
      {href ? (
        <PendingLink
          href={href}
          className="flex items-start gap-2 p-2.5 no-underline hover:bg-muted/40"
        >
          {body}
        </PendingLink>
      ) : (
        <CardContent className="flex items-start gap-2 p-2.5">
          {body}
        </CardContent>
      )}
    </Card>
  );
}
