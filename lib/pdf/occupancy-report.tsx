import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type {
  OccupancyGroup,
  OccupancyStatus,
  OccupancyTotals,
} from "@/lib/occupancy-report";
import { formatSqm } from "@/lib/unit-area";

/**
 * Occupancy & Vacancy Report — every unit's status for one month, grouped by
 * property, with area (m²) so let vs empty space is visible at a glance.
 * Built for long lists (hundreds of units): one continuous table with a
 * header that repeats on every page, rows that never split across pages, and
 * property bands that never strand at the bottom of a page.
 */

const COLORS = {
  primary: "#0F7A83",
  primaryDark: "#0A4F55",
  accentBg: "#E4F5F6",
  emerald: "#059669",
  emeraldSoft: "#ECFDF5",
  amber: "#B45309",
  amberSoft: "#FFFBEB",
  slate: "#475569",
  slateSoft: "#F1F5F9",
  muted: "#F8FAFC",
  mutedForeground: "#64748B",
  border: "#E2E8F0",
  foreground: "#0F172A",
  stripe: "#FAFAFA",
};

const STATUS_STYLE: Record<
  OccupancyStatus,
  { label: string; color: string; bg: string }
> = {
  occupied: { label: "Occupied", color: COLORS.emerald, bg: COLORS.emeraldSoft },
  partial: { label: "Part-month", color: COLORS.amber, bg: COLORS.amberSoft },
  vacant: { label: "Vacant", color: COLORS.slate, bg: COLORS.slateSoft },
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 44,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: COLORS.foreground,
  },
  headerBar: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 9,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  eyebrow: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: COLORS.primaryDark, marginTop: 2 },
  subtitle: { fontSize: 9, color: COLORS.mutedForeground, marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  headerMonth: { fontSize: 13, fontFamily: "Helvetica-Bold", color: COLORS.primary },
  headerPeriod: { fontSize: 7.5, color: COLORS.mutedForeground, marginTop: 2 },

  statRow: { flexDirection: "row", gap: 7, marginBottom: 6 },
  statCard: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
  },
  statAccent: { height: 3, borderRadius: 2, marginBottom: 6 },
  statValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  statLabel: { fontSize: 7, color: COLORS.mutedForeground, marginTop: 2 },
  statHint: { fontSize: 6.5, color: COLORS.mutedForeground, marginTop: 1 },
  areaNote: { fontSize: 7, color: COLORS.mutedForeground, marginBottom: 10 },

  tableHead: {
    flexDirection: "row",
    backgroundColor: COLORS.primaryDark,
    borderRadius: 3,
    marginTop: 4,
  },
  th: {
    padding: 5,
    fontSize: 6.8,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  band: {
    backgroundColor: COLORS.accentBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    marginTop: 9,
    paddingVertical: 5,
    paddingHorizontal: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bandName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: COLORS.primaryDark },
  bandType: { fontSize: 7.5, color: COLORS.mutedForeground },
  bandStats: { fontSize: 7.5, color: COLORS.primaryDark, fontFamily: "Helvetica-Bold" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    alignItems: "center",
  },
  td: { padding: 4.5, fontSize: 8 },
  pill: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  colUnit: { width: "10%" },
  colFloor: { width: "6%" },
  colArea: { width: "10%", textAlign: "right" },
  colStatus: { width: "12%" },
  colDays: { width: "9%", textAlign: "center" },
  colTenant: { width: "22%" },
  colRent: { width: "10%", textAlign: "right" },
  colNote: { width: "21%" },
  empty: { padding: 20, textAlign: "center", color: COLORS.mutedForeground },
  footer: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    paddingTop: 5,
    fontSize: 7,
    color: COLORS.mutedForeground,
  },
});

function Stat({
  value,
  label,
  hint,
  color,
}: {
  value: string;
  label: string;
  hint?: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statAccent, { backgroundColor: color }]} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function bandSummary(t: OccupancyTotals): string {
  const parts = [`${t.occupied + t.partial} of ${t.units} let`];
  if (t.totalSqm > 0) {
    parts.push(`${formatSqm(t.occupiedSqm)} occupied`, `${formatSqm(t.vacantSqm)} vacant`);
  }
  return parts.join("   ·   ");
}

export type OccupancyPdfProps = {
  scopeLabel: string;
  monthLabel: string;
  periodLabel: string;
  periodDays: number;
  statusFilterLabel: string | null;
  totals: OccupancyTotals;
  groups: (Omit<OccupancyGroup, "rows"> & {
    rows: (OccupancyGroup["rows"][number] & { rentLabel: string })[];
  })[];
  generatedAt: string;
};

export function OccupancyReportDocument({
  scopeLabel,
  monthLabel,
  periodLabel,
  periodDays,
  statusFilterLabel,
  totals,
  groups,
  generatedAt,
}: OccupancyPdfProps) {
  const letUnits = totals.occupied + totals.partial;
  const hasArea = totals.totalSqm > 0;

  return (
    <Document title={`Occupancy Report — ${monthLabel} — ${scopeLabel}`}>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.eyebrow}>Shumookh · Property management</Text>
            <Text style={styles.title}>Occupancy & Vacancy Report</Text>
            <Text style={styles.subtitle}>
              {scopeLabel}
              {statusFilterLabel ? `  ·  Showing ${statusFilterLabel} units only` : ""}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerMonth}>{monthLabel}</Text>
            <Text style={styles.headerPeriod}>
              {periodLabel} · {periodDays} days
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <Stat value={String(totals.units)} label="Total units" color={COLORS.primaryDark} />
          <Stat
            value={String(totals.occupied)}
            label="Occupied all period"
            color={COLORS.emerald}
          />
          <Stat
            value={String(totals.partial)}
            label="Part-month"
            hint="moved in or out"
            color={COLORS.amber}
          />
          <Stat value={String(totals.vacant)} label="Vacant all period" color={COLORS.slate} />
          <Stat
            value={`${totals.occupancyPct}%`}
            label="Occupancy"
            hint={`${letUnits} of ${totals.units} units let`}
            color={COLORS.primary}
          />
          {hasArea ? (
            <>
              <Stat
                value={formatSqm(totals.occupiedSqm)}
                label="Occupied area"
                hint={`of ${formatSqm(totals.totalSqm)}`}
                color={COLORS.emerald}
              />
              <Stat
                value={formatSqm(totals.vacantSqm)}
                label="Vacant area"
                hint="available to let"
                color={COLORS.slate}
              />
            </>
          ) : null}
        </View>
        {hasArea ? (
          <Text style={styles.areaNote}>
            Area figures are weighted by days occupied
            {totals.unitsWithoutArea > 0
              ? `; ${totals.unitsWithoutArea} unit${totals.unitsWithoutArea === 1 ? "" : "s"} with no area recorded ${totals.unitsWithoutArea === 1 ? "is" : "are"} excluded.`
              : "."}
          </Text>
        ) : (
          <Text style={styles.areaNote}>No unit areas recorded for this selection.</Text>
        )}

        <View style={styles.tableHead} fixed>
          <Text style={[styles.th, styles.colUnit]}>Unit</Text>
          <Text style={[styles.th, styles.colFloor]}>Floor</Text>
          <Text style={[styles.th, styles.colArea, { textTransform: "none" }]}>Area (m²)</Text>
          <Text style={[styles.th, styles.colStatus]}>Status</Text>
          <Text style={[styles.th, styles.colDays]}>Days</Text>
          <Text style={[styles.th, styles.colTenant]}>Tenant</Text>
          <Text style={[styles.th, styles.colRent, { textAlign: "right" }]}>Rent (OMR)</Text>
          <Text style={[styles.th, styles.colNote]}>Notes</Text>
        </View>

        {groups.length === 0 ? (
          <Text style={styles.empty}>No units match this selection.</Text>
        ) : (
          groups.map((group) => (
            <View key={group.propertyId}>
              <View style={styles.band} minPresenceAhead={60}>
                <View>
                  <Text style={styles.bandName}>{group.propertyName}</Text>
                  <Text style={styles.bandType}>{group.propertyTypeLabel}</Text>
                </View>
                <Text style={styles.bandStats}>{bandSummary(group.totals)}</Text>
              </View>

              {group.rows.map((row, index) => {
                const s = STATUS_STYLE[row.status];
                return (
                  <View
                    key={row.unitId}
                    style={[
                      styles.row,
                      index % 2 === 1 ? { backgroundColor: COLORS.stripe } : {},
                    ]}
                    wrap={false}
                  >
                    <Text style={[styles.td, styles.colUnit, { fontFamily: "Helvetica-Bold" }]}>
                      {row.unitLabel}
                    </Text>
                    <Text style={[styles.td, styles.colFloor]}>
                      {row.floor === null ? "—" : String(row.floor)}
                    </Text>
                    <Text style={[styles.td, styles.colArea]}>
                      {row.areaSqm === null
                        ? "—"
                        : row.areaSqm.toLocaleString("en-US", {
                            maximumFractionDigits: 2,
                          })}
                    </Text>
                    <View style={[styles.td, styles.colStatus]}>
                      <Text style={[styles.pill, { color: s.color, backgroundColor: s.bg }]}>
                        {s.label}
                      </Text>
                    </View>
                    <Text style={[styles.td, styles.colDays]}>
                      {row.occupiedDays}/{periodDays}
                    </Text>
                    <Text style={[styles.td, styles.colTenant]}>
                      {row.status === "vacant" ? "—" : (row.tenantName ?? "—")}
                    </Text>
                    <Text style={[styles.td, styles.colRent]}>{row.rentLabel}</Text>
                    <Text style={[styles.td, styles.colNote, { color: COLORS.mutedForeground }]}>
                      {row.note}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>
            Generated {generatedAt} · Shumookh Investment &amp; Services
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
