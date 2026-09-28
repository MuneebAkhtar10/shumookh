import "server-only";

import { prisma } from "@/lib/prisma";
import type { TenancyExtraction } from "@/lib/tenancy-extract";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * Looks the extracted property / unit / tenant up in the database so the
 * import flow knows what already exists and what has to be created first.
 * Pure lookups — nothing is written here.
 */

export type PropertyCandidate = {
  id: string;
  name: string;
  score: number;
  /** What lined up, e.g. ["building number", "way", "plot"]. */
  matchedOn: string[];
};

export type TenancyMatch = {
  property: {
    /** found = confident match; suggested = similar ones exist, ask; missing = none. */
    status: "found" | "suggested" | "missing";
    id?: string;
    name?: string;
    candidates: PropertyCandidate[];
    /** Name to pre-fill if the person chooses to create it. */
    suggestedName: string;
    suggestedAddress: string;
  };
  unit: {
    status: "found" | "occupied" | "missing";
    id?: string;
    label?: string;
    /** The unit label to pre-fill when creating it. */
    suggestedLabel: string;
  };
  tenant: {
    status: "found" | "busy" | "missing";
    id?: string;
    name?: string;
    matchedBy?: "Civil ID" | "phone" | "email" | "name";
    /** Pre-filled values if the person chooses to create the tenant. */
    suggested: {
      firstName: string;
      lastName: string;
      phone: string;
      civilId: string;
      email: string;
      nationality: string;
    };
  };
};

const norm = (value: string | null | undefined): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const compact = (value: string | null | undefined): string => norm(value).replace(/ /g, "");

/** "Apt 1001" / "Flat No. 1001" / "1001" -> "1001". */
export function unitKey(label: string | null | undefined): string {
  return compact(
    (label ?? "").replace(/\b(apt|apartment|flat|unit|shop|villa|office|no|number)\b\.?/gi, ""),
  );
}

/** Contracts often list two numbers ("24550198 / 98765432"); pick one Omani
 * mobile if there is one (starts 7 or 9), else the first. Returns digits with a
 * leading "+" only when the document had one. */
export function pickPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const parts = raw
    .split(/[\/,;|]|\s{2,}|\band\b/i)
    .map((p) => p.replace(/[^\d+]/g, ""))
    .filter((p) => p.replace(/\D/g, "").length >= 7);
  if (parts.length === 0) return raw.replace(/[^\d+]/g, "").slice(0, 13);
  const local = (p: string) => p.replace(/\D/g, "").replace(/^968/, "");
  const chosen = parts.find((p) => /^[79]/.test(local(p))) ?? parts[0];
  return chosen.slice(0, 13);
}

const last8 = (phone: string): string => phone.replace(/\D/g, "").slice(-8);

export function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (full ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * A sensible default name for a property the agreement refers to but the system
 * doesn't have. Agreements rarely name the building — the Muscat form only has
 * numbers — so build one from whatever location details exist, most specific
 * first. Never empty: the person edits it before confirming.
 */
export function suggestedPropertyName(p: TenancyExtraction["property"]): string {
  if (p.buildingName) return p.buildingName;

  const place = [p.area, p.block ? `Block ${p.block}` : null].filter(Boolean).join(" · ");
  if (p.buildingNumber) {
    return [`Building ${p.buildingNumber}`, place].filter(Boolean).join(", ");
  }
  if (place) return place;

  const numbers = [
    p.complexNumber ? `Complex ${p.complexNumber}` : null,
    p.plot ? `Plot ${p.plot}` : null,
    p.way ? `Way ${p.way}` : null,
    p.street ? `Street ${p.street}` : null,
  ].filter(Boolean);
  if (numbers.length > 0) return numbers.slice(0, 2).join(", ");

  return p.unitLabel ? `Property of ${p.unitLabel}` : "New property";
}

function suggestedAddress(p: TenancyExtraction["property"]): string {
  return [
    p.area,
    p.block ? `Block ${p.block}` : null,
    p.buildingNumber ? `Building ${p.buildingNumber}` : null,
    p.complexNumber ? `Complex ${p.complexNumber}` : null,
    p.way ? `Way ${p.way}` : null,
    p.street ? `Street ${p.street}` : null,
    p.plot ? `Plot ${p.plot}` : null,
    p.governorate,
  ]
    .filter(Boolean)
    .join(" · ");
}

export async function matchTenancy(extraction: TenancyExtraction): Promise<TenancyMatch> {
  const p = extraction.property;
  const t = extraction.tenant;
  const phone = pickPhone(t.phone);
  const name = splitName(t.name);

  /* ── Property ─────────────────────────────────────────────────────────── */
  const properties = await prisma.property.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      area: true,
      buildingName: true,
      buildingNumber: true,
      wayNumber: true,
      plotNumber: true,
    },
  });

  // A property is only auto-selected when the agreement NAMES it. Building, way
  // and plot numbers alone can coincide between different properties, so a
  // number-only match is offered as a suggestion for the person to confirm.
  const wantName = norm(p.buildingName);
  const scored = properties
    .map((prop) => {
      let score = 0;
      const matchedOn: string[] = [];
      let nameHit = false;
      if (wantName && (norm(prop.name) === wantName || norm(prop.buildingName) === wantName)) {
        score += 10;
        nameHit = true;
        matchedOn.push("name");
      } else if (wantName && (norm(prop.name).includes(wantName) || wantName.includes(norm(prop.name)))) {
        score += 3;
        matchedOn.push("similar name");
      }
      if (p.buildingNumber && compact(prop.buildingNumber) === compact(p.buildingNumber)) {
        score += 3;
        matchedOn.push("building number");
      }
      if (p.way && compact(prop.wayNumber) === compact(p.way)) {
        score += 2;
        matchedOn.push("way");
      }
      if (p.plot && compact(prop.plotNumber) === compact(p.plot)) {
        score += 2;
        matchedOn.push("plot");
      }
      const where = norm(`${prop.address} ${prop.area ?? ""}`);
      if (p.area && where.includes(norm(p.area))) {
        score += 1;
        matchedOn.push("area");
      }
      return { id: prop.id, name: prop.name, score, matchedOn, nameHit };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const propertyStatus: TenancyMatch["property"]["status"] =
    best?.nameHit && scored.filter((c) => c.nameHit).length === 1
      ? "found"
      : scored.length > 0 && best.score >= 3
        ? "suggested"
        : "missing";

  /* ── Unit ─────────────────────────────────────────────────────────────── */
  const wantUnit = unitKey(p.unitLabel);
  let unit: TenancyMatch["unit"] = {
    status: "missing",
    suggestedLabel: (p.unitLabel ?? "").replace(/^(apt|apartment|flat|unit|shop|villa)\.?\s*(no\.?)?\s*/i, "").trim(),
  };
  if (propertyStatus === "found" && wantUnit) {
    const units = await prisma.unit.findMany({
      where: { propertyId: best.id },
      select: { id: true, label: true, tenantId: true },
    });
    const hit = units.find((u) => unitKey(u.label) === wantUnit);
    if (hit) {
      unit = {
        status: hit.tenantId ? "occupied" : "found",
        id: hit.id,
        label: hit.label,
        suggestedLabel: hit.label,
      };
    }
  }

  /* ── Tenant ───────────────────────────────────────────────────────────── */
  const tenantSelect = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    unit: { select: { id: true } },
  } as const;
  let hit: { row: Awaited<ReturnType<typeof prisma.user.findFirst<{ select: typeof tenantSelect }>>>; by: NonNullable<TenancyMatch["tenant"]["matchedBy"]> } | null = null;

  if (t.idNumber) {
    const row = await prisma.user.findFirst({
      where: { userType: UserType.user, civilId: t.idNumber },
      select: tenantSelect,
    });
    if (row) hit = { row, by: "Civil ID" };
  }
  if (!hit && phone.replace(/\D/g, "").length >= 7) {
    const row = await prisma.user.findFirst({
      where: { userType: UserType.user, phone: { endsWith: last8(phone) } },
      select: tenantSelect,
    });
    if (row) hit = { row, by: "phone" };
  }
  if (!hit && t.email) {
    const row = await prisma.user.findFirst({
      where: { userType: UserType.user, email: t.email },
      select: tenantSelect,
    });
    if (row) hit = { row, by: "email" };
  }
  if (!hit && name.firstName) {
    const wantTokens = norm(t.name).split(" ").sort().join(" ");
    const rows = await prisma.user.findMany({
      where: {
        userType: UserType.user,
        firstName: { contains: name.firstName, mode: "insensitive" },
      },
      select: tenantSelect,
      take: 50,
    });
    const row = rows.find(
      (r) => norm(`${r.firstName ?? ""} ${r.lastName ?? ""}`).split(" ").sort().join(" ") === wantTokens,
    );
    if (row) hit = { row, by: "name" };
  }

  const tenant: TenancyMatch["tenant"] = {
    status: hit ? (hit.row!.unit ? "busy" : "found") : "missing",
    id: hit?.row?.id,
    name: hit
      ? [hit.row!.firstName, hit.row!.lastName].filter(Boolean).join(" ") || hit.row!.email
      : undefined,
    matchedBy: hit?.by,
    suggested: {
      firstName: name.firstName,
      lastName: name.lastName,
      phone,
      civilId: t.idNumber ?? "",
      email: t.email ?? "",
      nationality: t.nationality ?? "",
    },
  };

  return {
    property: {
      status: propertyStatus,
      id: propertyStatus === "found" ? best.id : undefined,
      name: propertyStatus === "found" ? best.name : undefined,
      candidates: scored.slice(0, 3).map(({ id, name, score, matchedOn }) => ({ id, name, score, matchedOn })),
      suggestedName: suggestedPropertyName(p),
      suggestedAddress: suggestedAddress(p),
    },
    unit,
    tenant,
  };
}
