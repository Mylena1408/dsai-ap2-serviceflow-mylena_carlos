"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ReservationOverlapError,
  ReservationProblemsError,
  cancelMyExam,
  cancelMyReservation,
  createReservation,
  requestExam,
} from "@/modules/spaces";
import { ApplicationError } from "@/server/errors";
import { problemsParameter } from "@/app/_components/space-messages";

// The requester's side of the spaces (SPEC 2026-11-16-professores-e-tecnicos, parts D and E): reserve, cancel, ask for
// an exam's allocation and cancel it. Each answer comes back to the page as a short code in the address.

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The page's code for a refusal; the problems of a series go as "day:problem" pairs (P8). */
function refusal(error: ApplicationError): string {
  if (error instanceof ReservationProblemsError) return `problems=${encodeURIComponent(problemsParameter(error.problems))}`;
  if (error instanceof ReservationOverlapError) return "error=overlap";
  if (error.code === "VALIDATION_ERROR") return "error=invalid";
  if (error.code === "NOT_FOUND") return "error=missing";
  if (error.code === "CONFLICT") return "error=state";
  return "error=denied";
}

export async function createReservationAction(formData: FormData): Promise<never> {
  const spaceId = field(formData, "spaceId");
  const back = `/spaces/${encodeURIComponent(spaceId)}`;
  let status: string;
  try {
    const result = await createReservation({
      spaceId,
      purpose: field(formData, "purpose"),
      description: field(formData, "description"),
      attendees: field(formData, "attendees"),
      day: field(formData, "day"),
      start: field(formData, "start"),
      end: field(formData, "end"),
      repeatUntil: field(formData, "repeatUntil"),
    });
    status = result.status === "CONFIRMED" ? "confirmed" : "pending";
    if (result.ids.length > 1) status += `&count=${result.ids.length}`;
  } catch (error) {
    if (error instanceof ApplicationError) redirect(`${back}?week=${encodeURIComponent(field(formData, "day"))}&${refusal(error)}`);
    throw error;
  }
  revalidatePath("/spaces");
  redirect(`${back}?week=${encodeURIComponent(field(formData, "day"))}&reserved=${status}`);
}

export async function cancelReservationAction(formData: FormData): Promise<never> {
  try {
    await cancelMyReservation(field(formData, "reservationId"), { scope: field(formData, "scope"), note: field(formData, "note") });
  } catch (error) {
    if (error instanceof ApplicationError) redirect(`/spaces/reservations?${refusal(error)}`);
    throw error;
  }
  revalidatePath("/spaces/reservations");
  redirect("/spaces/reservations?notice=cancelled");
}

export async function requestExamAction(formData: FormData): Promise<never> {
  try {
    await requestExam({
      sectorId: field(formData, "sectorId"),
      course: field(formData, "course"),
      classGroup: field(formData, "classGroup"),
      day: field(formData, "day"),
      start: field(formData, "start"),
      end: field(formData, "end"),
      students: field(formData, "students"),
      spaceKind: field(formData, "spaceKind"),
      notes: field(formData, "notes"),
    });
  } catch (error) {
    if (error instanceof ApplicationError) redirect(`/spaces/exams?${refusal(error)}`);
    throw error;
  }
  revalidatePath("/spaces/exams");
  redirect("/spaces/exams?notice=requested");
}

export async function cancelExamAction(formData: FormData): Promise<never> {
  try {
    await cancelMyExam(field(formData, "examId"), field(formData, "note"));
  } catch (error) {
    if (error instanceof ApplicationError) redirect(`/spaces/exams?${refusal(error)}`);
    throw error;
  }
  revalidatePath("/spaces/exams");
  redirect("/spaces/exams?notice=cancelled");
}
