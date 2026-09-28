"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { pushPropertyToDynamics, pushTenantToDynamics, pushUnitToDynamics } from "@/lib/dynamics/entities";
import { OMAN_GOVERNORATES } from "@/lib/oman";
import { isValidPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { defaultUnitPermissions } from "@/lib/property-types";
import { publish } from "@/lib/realtime";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractTenancyFromPdf, type TenancyExtraction } from "@/lib/tenancy-extract";
import { matchTenancy, unitKey, type TenancyMatch } from "@/lib/tenancy-match";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";
import { parseAreaSqm } from "@/lib/unit-area";
import { STAFF_ADMIN_TYPES } from "@/lib/user-roles";
import { UserType } from "@/lib/generated/prisma/client";

/**
 * "Create a tenancy from a PDF": read the signed agreement, look up what
 * already exists, and create only what is missing — each step confirmed by a
 * person in the UI. Every action here is admin-only and returns a result
 * object (never redirects) so the dialog can show the outcome in place.
 */

type Fail = { ok: false; error: string };

function publishDirectory(userIds: string[] = []) {
  return publish({ kind: "directory", roles: [...STAFF_ADMIN_TYPES], userIds });
}

/* ── 1. Read the PDF ──────────────────────────────────────────────────────── */

export async function readTenancyPdfAction(
  formData: FormData,
): Promise<{ ok: true; extraction: TenancyExtraction; match: TenancyMatch; fileName: string } | Fail> {
  await requireRole(UserType.admin);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PDF file first." };
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return { ok: false, error: "That isn't a PDF. Upload the signed agreement as a PDF." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_LABEL}.` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, error: "That file doesn't look like a valid PDF." };
  }

  const extracted = await extractTenancyFromPdf(buffer.toString("base64"));
  if (!extracted.ok) return extracted;

  const hasAnything =
    extracted.data.tenant.name ||
    extracted.data.property.unitLabel ||
    extracted.data.contract.monthlyRent !== null ||
    extracted.data.contract.startDate;
  if (!hasAnything) {
    return {
      ok: false,
      error: "This doesn't look like a tenancy agreement — no tenant, unit, dates or rent were found.",
    };
  }

  return {
    ok: true,
    extraction: extracted.data,
    match: await matchTenancy(extracted.data),
    fileName: file.name,
  };
}

/** After the person picks a different existing property than the one the reader
 * matched, look the agreement's unit up inside it. */
export async function findUnitInPropertyAction(input: {
  propertyId: string;
  label: string;
}): Promise<TenancyMatch["unit"]> {
  await requireRole(UserType.admin);
  const want = unitKey(input.label);
  const units = await prisma.unit.findMany({
    where: { propertyId: input.propertyId },
    select: { id: true, label: true, tenantId: true },
  });
  const hit = want ? units.find((u) => unitKey(u.label) === want) : undefined;
  return hit
    ? { status: hit.tenantId ? "occupied" : "found", id: hit.id, label: hit.label, suggestedLabel: hit.label }
    : { status: "missing", suggestedLabel: input.label.replace(/^(apt|apartment|flat|unit|shop|villa)\.?\s*(no\.?)?\s*/i, "").trim() };
}

/* ── 2. Create what's missing ─────────────────────────────────────────────── */

export type CreatedUnit = {
  id: string;
  label: string;
  propertyName: string;
  propertyTypeId: string;
  propertyTypeName: string;
  propertyTypeLabel: string;
  propertyTypeUnitNounSingular: string;
  propertyTypeUnitNounPlural: string;
  propertyTypeUnitPrefix: string | null;
  propertyTypeShowRentBills: boolean;
};

export async function createPropertyFromContractAction(input: {
  name: string;
  propertyTypeId: string;
  address: string;
  governorate: string;
  area: string;
  buildingNumber: string;
  wayNumber: string;
  plotNumber: string;
}): Promise<{ ok: true; property: { id: string; name: string; propertyTypeId: string } } | Fail> {
  await requireRole(UserType.admin);

  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) return { ok: false, error: "Enter the property name." };
  if (!address) return { ok: false, error: "Enter the address (area, block, way…)." };

  const propertyType = await prisma.propertyType.findUnique({ where: { id: input.propertyTypeId } });
  if (!propertyType) return { ok: false, error: "Choose a property type." };

  if (input.governorate && !OMAN_GOVERNORATES.includes(input.governorate as (typeof OMAN_GOVERNORATES)[number])) {
    return { ok: false, error: "Select a valid Oman governorate." };
  }

  const duplicate = await prisma.property.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: `A property called “${name}” already exists — pick it from the list instead.` };
  }

  const property = await prisma.property.create({
    data: {
      name,
      propertyTypeId: propertyType.id,
      address,
      governorate: input.governorate || null,
      area: input.area.trim() || null,
      buildingNumber: input.buildingNumber.trim() || null,
      wayNumber: input.wayNumber.trim() || null,
      plotNumber: input.plotNumber.trim() || null,
      approved: true,
    },
  });

  try {
    await pushPropertyToDynamics({
      name: property.name,
      address: property.address,
      governorate: property.governorate,
      propertyType: propertyType.label,
      status: "Active",
    });
  } catch (error) {
    console.error("Dynamics sync failed for property:", property.id, error);
  }

  await publishDirectory();
  revalidatePath("/protected/properties");

  return { ok: true, property: { id: property.id, name: property.name, propertyTypeId: propertyType.id } };
}

export async function createUnitFromContractAction(input: {
  propertyId: string;
  label: string;
  areaSqm: string;
  floor: string;
}): Promise<{ ok: true; unit: CreatedUnit } | Fail> {
  await requireRole(UserType.admin);

  const label = input.label.trim();
  if (!label) return { ok: false, error: "Enter the unit number." };

  // Area is mandatory for every unit — space is what the client lets by.
  const area = parseAreaSqm(input.areaSqm, { required: true });
  if (!area.ok) return { ok: false, error: area.error };

  const floorText = input.floor.trim();
  const floor = floorText ? Number(floorText) : null;
  if (floorText && !Number.isInteger(floor)) return { ok: false, error: "Floor must be a whole number." };

  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    include: { propertyType: true },
  });
  if (!property) return { ok: false, error: "That property no longer exists." };

  if (await prisma.unit.findUnique({ where: { propertyId_label: { propertyId: property.id, label } } })) {
    return { ok: false, error: `Unit ${label} already exists in ${property.name}.` };
  }

  const type = property.propertyType;
  const permissions = defaultUnitPermissions(type);
  const unit = await prisma.unit.create({
    data: {
      propertyId: property.id,
      label,
      floor: type.hasFloors ? floor : null,
      areaSqm: area.value,
      rentBillsEnabled: permissions.rentBillsEnabled,
      maintenanceEnabled: permissions.maintenanceEnabled,
    },
  });

  try {
    await pushUnitToDynamics({
      label,
      propertyName: property.name,
      bedrooms: null,
      status: "Vacant",
    });
  } catch (error) {
    console.error("Dynamics sync failed for unit:", unit.id, error);
  }

  await publishDirectory();
  revalidatePath(`/protected/properties/${property.id}`);

  return {
    ok: true,
    unit: {
      id: unit.id,
      label: unit.label,
      propertyName: property.name,
      propertyTypeId: type.id,
      propertyTypeName: type.name,
      propertyTypeLabel: type.label,
      propertyTypeUnitNounSingular: type.unitNounSingular,
      propertyTypeUnitNounPlural: type.unitNounPlural,
      propertyTypeUnitPrefix: type.unitPrefix,
      propertyTypeShowRentBills: type.showRentBills,
    },
  };
}

export async function createTenantFromContractAction(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  civilId: string;
  nationality: string;
}): Promise<
  | {
      ok: true;
      tenant: { id: string; email: string; firstName: string | null; lastName: string | null };
      temporaryPassword: string;
    }
  | Fail
> {
  await requireRole(UserType.admin);

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.replace(/[\s-]/g, "");
  const civilId = input.civilId.trim() || null;
  const nationality = input.nationality.trim() || null;

  if (!firstName) return { ok: false, error: "Enter the tenant's name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter the tenant's email — it becomes their login." };
  }
  if (!phone) return { ok: false, error: "Enter a phone number." };
  if (!isValidPhone(phone)) {
    return { ok: false, error: "Phone must be digits only, with an optional leading +, up to 13 characters." };
  }

  if (await prisma.user.findUnique({ where: { email_userType: { email, userType: UserType.user } } })) {
    return { ok: false, error: "A tenant with that email already exists — choose them from the list instead." };
  }
  if (civilId && (await prisma.user.findUnique({ where: { civilId } }))) {
    return { ok: false, error: "That Civil ID is already recorded for another person." };
  }
  if (await prisma.user.findUnique({ where: { phone } })) {
    return { ok: false, error: "That phone number already belongs to another account." };
  }

  // Shown once so the admin can hand it over; it can be reset from People.
  const temporaryPassword = randomBytes(9).toString("base64url");

  const { data: authUser, error: authError } = await createAdminClient().auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (authError || !authUser.user) {
    return { ok: false, error: authError?.message ?? "Could not create the tenant's account." };
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        id: authUser.user.id,
        email,
        userType: UserType.user,
        firstName,
        lastName: lastName || null,
        phone,
        civilId,
        nationality,
      },
    });
  } catch (error) {
    // Don't leave a login with no profile behind it.
    await createAdminClient().auth.admin.deleteUser(authUser.user.id);
    console.error("Tenant profile creation failed:", error);
    return { ok: false, error: "Could not save the tenant. Nothing was created." };
  }

  try {
    await pushTenantToDynamics({
      name: [firstName, lastName].filter(Boolean).join(" ") || email,
      email,
      phone,
    });
  } catch (error) {
    console.error("Dynamics sync failed for tenant:", user.id, error);
  }

  await publishDirectory([user.id]);
  revalidatePath("/protected/users");

  return {
    ok: true,
    tenant: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    temporaryPassword,
  };
}
