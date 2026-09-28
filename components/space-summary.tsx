import Link from "next/link";

import { formatSqm, type SpaceStats } from "@/lib/unit-area";

/**
 * Occupied vs vacant floor area (m²) — for clients who let space by the
 * square metre and need to see how much of it is actually taken. Rendered
 * inside whatever Card the page provides.
 */
export function SpaceSummary({
  stats,
  properties,
  className,
}: {
  stats: SpaceStats;
  /** Optional per-property breakdown (only properties with measured area
   * are listed). */
  properties?: { id: string; name: string; space: SpaceStats }[];
  className?: string;
}) {
  const withArea = (properties ?? []).filter((p) => p.space.totalSqm > 0);

  if (stats.unitsWithArea === 0) {
    return (
      <p className={className ?? "py-4 text-center text-sm text-muted-foreground"}>
        No unit areas recorded yet. Add an area (m²) to a unit to see occupied
        and vacant space here.
      </p>
    );
  }

  return (
    <div className={className ?? "space-y-4"}>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Figure label="Total" value={formatSqm(stats.totalSqm)} />
        <Figure
          label="Occupied"
          value={formatSqm(stats.occupiedSqm)}
          hint={`${stats.occupiedPct}%`}
          swatch="bg-[#23abb5]"
        />
        <Figure
          label="Vacant"
          value={formatSqm(stats.vacantSqm)}
          hint={`${100 - stats.occupiedPct}%`}
          swatch="bg-slate-300"
        />
      </div>

      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-slate-200"
        role="img"
        aria-label={`${stats.occupiedPct}% of measured space is occupied`}
      >
        <div
          className="h-full bg-[#23abb5]"
          style={{ width: `${stats.occupiedPct}%` }}
        />
      </div>

      {stats.unitsWithoutArea > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.unitsWithoutArea} unit{stats.unitsWithoutArea === 1 ? "" : "s"}{" "}
          with no area recorded {stats.unitsWithoutArea === 1 ? "is" : "are"}{" "}
          not included in these figures.
        </p>
      )}

      {withArea.length > 0 && (
        <ul className="space-y-2.5 pt-1">
          {withArea.slice(0, 8).map((property) => (
            <li key={property.id}>
              <Link
                href={`/protected/properties/${property.id}`}
                className="block rounded-lg px-0.5 py-0.5 hover:bg-muted/50"
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium">{property.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatSqm(property.space.occupiedSqm)} /{" "}
                    {formatSqm(property.space.totalSqm)} ·{" "}
                    {property.space.occupiedPct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#23abb5]"
                    style={{ width: `${property.space.occupiedPct}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  swatch,
}: {
  label: string;
  value: string;
  hint?: string;
  swatch?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {swatch && <span className={`h-2 w-2 rounded-full ${swatch}`} />}
        {label}
      </p>
      <p className="font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs tabular-nums text-muted-foreground">{hint}</p>}
    </div>
  );
}
