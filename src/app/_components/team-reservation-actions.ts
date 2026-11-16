"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ReservationOverlapError, ReservationProblemsError, allocateExam, decideReservation, refuseExam } from "@/modules/spaces";
import { ApplicationError, ValidationError } from "@/server/errors";
import { problemsParameter } from "./space-messages";

// The team's side of the spaces (SPEC 2026-11-16-professores-e-tecnicos, P10 and P13), from the attendant's and the
// manager's page "Reservas": confirm, refuse and cancel reservations; allocate and refuse exams.

const PAGES = new Set(["/queue/reservations", "/approvals/reservations"]);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Only the two pages of this area are a way back. */
function pageOf(formData: FormData): string {
  const page = field(formData, "returnTo");
  return PAGES.has(page) ? page : "/queue/reservations";
}

function refusal(error: ApplicationError): string {
  if (error instanceof ReservationProblemsError) return `problems=${encodeURIComponent(problemsParameter(error.problems))}`;
  if (error instanceof ReservationOverlapError) return "error=overlap";
  if (error instanceof ValidationError && error.issues.some(({ code }) => code === "too_small")) return "error=small";
  if (error.code === "VALIDATION_ERROR") return "error=invalid";
  if (error.code === "NOT_FOUND") return "error=missing";
  if (error.code === "CONFLICT") return "error=state";
  return "error=denied";
}

async function run(formData: FormData, work: () => Promise<void>, notice: string, anchor = ""): Promise<never> {
  const page = pageOf(formData);
  try {
    await work();
  } catch (error) {
    if (error instanceof ApplicationError) redirect(`${page}?${refusal(error)}${anchor}`);
    throw error;
  }
  revalidatePath(page);
  redirect(`${page}?notice=${notice}${anchor}`);
}

export async function decideReservationAction(formData: FormData): Promise<never> {
  const decision = field(formData, "decision");
  const kind = decision === "confirm" || decision === "refuse" ? decision : "cancel";
  const notice = kind === "confirm" ? "confirmed" : kind === "refuse" ? "refused" : "sector-cancelled";
  return run(formData, () => decideReservation(field(formData, "reservationId"), kind, field(formData, "note")), notice);
}

export async function allocateExamAction(formData: FormData): Promise<never> {
  const spaceIds = formData.getAll("spaceId").map(String);
  return run(formData, () => allocateExam(field(formData, "examId"), spaceIds), "allocated", "#provas");
}

export async function refuseExamAction(formData: FormData): Promise<never> {
  return run(formData, () => refuseExam(field(formData, "examId"), field(formData, "note")), "exam-refused", "#provas");
}
