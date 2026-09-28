import "server-only";

import { extractJsonFromPdf } from "@/lib/gemini";

/**
 * What we pull out of a signed tenancy / lease agreement PDF. Every field is
 * nullable: the reader must leave a field null rather than guess, because the
 * person reviews the pre-filled form and a confident wrong value is worse than
 * an empty one.
 */
export type TenancyExtraction = {
  agreementRef: string | null;
  landlord: {
    name: string | null;
    idNumber: string | null;
    crNumber: string | null;
    phone: string | null;
    address: string | null;
  };
  tenant: {
    name: string | null;
    idNumber: string | null;
    laborCardNumber: string | null;
    sponsorName: string | null;
    crNumber: string | null;
    phone: string | null;
    email: string | null;
    nationality: string | null;
    address: string | null;
  };
  property: {
    unitLabel: string | null;
    buildingName: string | null;
    buildingNumber: string | null;
    area: string | null;
    block: string | null;
    plot: string | null;
    way: string | null;
    street: string | null;
    complexNumber: string | null;
    governorate: string | null;
    landUse: string | null;
    activity: string | null;
    areaSqm: number | null;
  };
  contract: {
    startDate: string | null;
    endDate: string | null;
    durationMonths: number | null;
    monthlyRent: number | null;
    payEveryMonths: number | null;
    rentDueDay: number | null;
    securityDeposit: number | null;
    purpose: "residential" | "commercial" | null;
    signedDate: string | null;
    paidBy: string | null;
    parkingSlot: string | null;
  };
  notes: string | null;
  /** Things the reader was unsure about, in plain English. */
  warnings: string[];
};

const str = { type: "STRING", nullable: true };
const num = { type: "NUMBER", nullable: true };

export const SCHEMA = {
  type: "OBJECT",
  properties: {
    agreementRef: str,
    landlord: {
      type: "OBJECT",
      properties: { name: str, idNumber: str, crNumber: str, phone: str, address: str },
    },
    tenant: {
      type: "OBJECT",
      properties: {
        name: str,
        idNumber: str,
        laborCardNumber: str,
        sponsorName: str,
        crNumber: str,
        phone: str,
        email: str,
        nationality: str,
        address: str,
      },
    },
    property: {
      type: "OBJECT",
      properties: {
        unitLabel: str,
        buildingName: str,
        buildingNumber: str,
        area: str,
        block: str,
        plot: str,
        way: str,
        street: str,
        complexNumber: str,
        governorate: str,
        landUse: str,
        activity: str,
        areaSqm: num,
      },
    },
    contract: {
      type: "OBJECT",
      properties: {
        startDate: str,
        endDate: str,
        durationMonths: num,
        monthlyRent: num,
        payEveryMonths: num,
        rentDueDay: num,
        securityDeposit: num,
        purpose: { type: "STRING", nullable: true, enum: ["residential", "commercial"] },
        signedDate: str,
        paidBy: str,
        parkingSlot: str,
      },
    },
    notes: str,
    warnings: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["landlord", "tenant", "property", "contract", "warnings"],
};

export const PROMPT = `You are reading a residential or commercial TENANCY / LEASE AGREEMENT from the Sultanate of Oman. It may be the one-page Muscat Municipality "Tenancy Agreement / عقد إيجار" form or a longer multi-page lease, in Arabic, English or both, typed, handwritten or scanned.

Extract the fields into the JSON schema. Rules:
- Only report what is actually written in the document. If a field is blank, unreadable or absent, return null. NEVER guess or invent.
- "First Party" / المؤجر is the LANDLORD; "Second Party" / المستأجر is the TENANT.
- Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to normal digits. Return names in the script they are written in; if both English and Arabic are given, prefer English.
- Dates must be ISO YYYY-MM-DD. Two-digit years like "26" mean 2026. If a date is only partly legible, return null and add a warning.
- monthlyRent and securityDeposit are plain numbers in Omani Rials (OMR/RO), no currency text. If only a total for the whole period is given, do NOT divide it — return null for monthlyRent and add a warning.
- payEveryMonths: how often rent is paid in advance, in months (monthly = 1, quarterly = 3, semi-annual = 6, yearly = 12).
- rentDueDay: the day of the month rent is due (1-28) only if stated, otherwise null.
- purpose: "residential" or "commercial" (shops, offices, industrial = commercial).
- property.unitLabel is the flat / shop / villa number. property.buildingName is a name only if a building or complex NAME is written (not just a number). Keep numbers such as block, plot, way, street as text.
- agreementRef is the agreement / contract number printed on the document (e.g. "No. 1403697").
- notes: any notable special terms (pets, parking, furnished, included utilities), otherwise null.
- warnings: short plain-English notes for anything uncertain, inconsistent or unreadable. Empty array if none.`;

export async function extractTenancyFromPdf(
  pdfBase64: string,
): Promise<{ ok: true; data: TenancyExtraction } | { ok: false; error: string }> {
  const result = await extractJsonFromPdf<TenancyExtraction>({
    pdfBase64,
    prompt: PROMPT,
    schema: SCHEMA,
    // A usable agreement has a tenant, a unit and at least rent or a start date.
    accept: (d) => {
      const n = normalizeExtraction(d);
      return Boolean(
        n.tenant.name &&
          n.property.unitLabel &&
          (n.contract.monthlyRent !== null || n.contract.startDate) &&
          // The property has to be identifiable too, or matching can't work.
          (n.property.buildingName || n.property.buildingNumber || n.property.area || n.property.plot),
      );
    },
    score: (d) => countFilled(normalizeExtraction(d)),
  });
  if (!result.ok) return result;

  const data = normalizeExtraction(result.data);
  // Say so plainly when the essentials weren't found, so the blanks in the
  // form aren't a mystery.
  const missing: [boolean, string][] = [
    [data.contract.monthlyRent === null, "the monthly rent"],
    [data.contract.startDate === null, "the start date"],
    [data.contract.endDate === null, "the end date"],
  ];
  for (const [isMissing, what] of missing) {
    if (isMissing) data.warnings.push(`Couldn't find ${what} in the document — please enter it.`);
  }
  return { ok: true, data };
}

/** Number of non-empty leaf values — a rough completeness score. */
function countFilled(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (Array.isArray(value)) return 0; // warnings aren't data
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>((n, v) => n + countFilled(v), 0);
  }
  return 1;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed && !/^(n\/?a|null|none|-+|—)$/i.test(trimmed) ? trimmed : null;
}

function cleanNum(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanDate(value: unknown): string | null {
  const v = clean(value);
  if (!v || !ISO_DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** The model is asked for clean values, but a review form should never receive
 * "N/A" strings, impossible dates or non-finite numbers. */
export function normalizeExtraction(raw: TenancyExtraction): TenancyExtraction {
  const p = raw.property ?? ({} as TenancyExtraction["property"]);
  const t = raw.tenant ?? ({} as TenancyExtraction["tenant"]);
  const l = raw.landlord ?? ({} as TenancyExtraction["landlord"]);
  const c = raw.contract ?? ({} as TenancyExtraction["contract"]);
  const dueDay = cleanNum(c.rentDueDay);

  return {
    agreementRef: clean(raw.agreementRef),
    landlord: {
      name: clean(l.name),
      idNumber: clean(l.idNumber),
      crNumber: clean(l.crNumber),
      phone: clean(l.phone),
      address: clean(l.address),
    },
    tenant: {
      name: clean(t.name),
      idNumber: clean(t.idNumber),
      laborCardNumber: clean(t.laborCardNumber),
      sponsorName: clean(t.sponsorName),
      crNumber: clean(t.crNumber),
      phone: clean(t.phone),
      email: clean(t.email)?.toLowerCase() ?? null,
      nationality: clean(t.nationality),
      address: clean(t.address),
    },
    property: {
      unitLabel: clean(p.unitLabel),
      buildingName: clean(p.buildingName),
      buildingNumber: clean(p.buildingNumber),
      area: clean(p.area),
      block: clean(p.block),
      plot: clean(p.plot),
      way: clean(p.way),
      street: clean(p.street),
      complexNumber: clean(p.complexNumber),
      governorate: clean(p.governorate),
      landUse: clean(p.landUse),
      activity: clean(p.activity),
      areaSqm: cleanNum(p.areaSqm) && cleanNum(p.areaSqm)! > 0 ? cleanNum(p.areaSqm) : null,
    },
    contract: {
      startDate: cleanDate(c.startDate),
      endDate: cleanDate(c.endDate),
      durationMonths: cleanNum(c.durationMonths),
      monthlyRent: cleanNum(c.monthlyRent) !== null && cleanNum(c.monthlyRent)! >= 0 ? cleanNum(c.monthlyRent) : null,
      payEveryMonths: cleanNum(c.payEveryMonths),
      rentDueDay: dueDay !== null && dueDay >= 1 && dueDay <= 28 ? Math.round(dueDay) : null,
      securityDeposit:
        cleanNum(c.securityDeposit) !== null && cleanNum(c.securityDeposit)! >= 0
          ? cleanNum(c.securityDeposit)
          : null,
      purpose: c.purpose === "commercial" ? "commercial" : c.purpose === "residential" ? "residential" : null,
      signedDate: cleanDate(c.signedDate),
      paidBy: clean(c.paidBy),
      parkingSlot: clean(c.parkingSlot),
    },
    notes: clean(raw.notes),
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.map((w) => clean(w)).filter((w): w is string => Boolean(w))
      : [],
  };
}
