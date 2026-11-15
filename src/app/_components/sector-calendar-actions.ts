"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSectorHours, createSectorHoliday, deleteSectorHoliday, saveSectorHours } from "@/modules/calendar";
import { ApplicationError } from "@/server/errors";

// A sector's calendar from the administration and the manager's area (SPEC 2026-11-09-comunicacao-e-calendarios, 6.1
// and 6.3 item 1; SF-253). The page to go back to is one of the known ones, never an address from the form; the sector
// goes back in the address only when it has the shape of an id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function pageOf(formData: FormData, code: string): string {
  if (field(formData, "area") !== "admin") return `/approvals/calendar?sectorCalendar=${code}`;
  const sectorId = field(formData, "sectorId");
  return `/admin?section=calendar${UUID.test(sectorId) ? `&calendarSector=${sectorId}` : ""}&sectorCalendar=${code}`;
}

/** The message code of a refusal (internal: only async exports become actions). */
function errorCode(error: ApplicationError): string {
  if (error.code === "CONFLICT") return "holiday-taken";
  if (error.code === "VALIDATION_ERROR") return "invalid";
  return "missing";
}

async function run(formData: FormData, work: () => Promise<unknown>, notice: string): Promise<never> {
  let code = notice;
  try {
    const result = await work();
    if (result && typeof result === "object" && "changed" in result && result.changed === false) code = "unchanged";
  } catch (error) {
    if (!(error instanceof ApplicationError)) throw error;
    code = errorCode(error);
  }
  revalidatePath(field(formData, "area") === "admin" ? "/admin" : "/approvals/calendar");
  redirect(pageOf(formData, code));
}

export async function saveSectorHoursAction(formData: FormData): Promise<never> {
  const input = {
    weekdays: formData.getAll("weekdays").map(String),
    startTime: field(formData, "startTime"),
    endTime: field(formData, "endTime"),
  };
  return run(formData, () => saveSectorHours(field(formData, "sectorId"), input), "hours-saved");
}

export async function clearSectorHoursAction(formData: FormData): Promise<never> {
  return run(formData, () => clearSectorHours(field(formData, "sectorId")), "hours-cleared");
}

export async function createSectorHolidayAction(formData: FormData): Promise<never> {
  const input = { day: field(formData, "day"), name: field(formData, "name"), yearly: formData.get("yearly") === "on" };
  return run(formData, () => createSectorHoliday(field(formData, "sectorId"), input), "holiday-created");
}

export async function deleteSectorHolidayAction(formData: FormData): Promise<never> {
  return run(formData, () => deleteSectorHoliday(field(formData, "holidayId")), "holiday-deleted");
}
