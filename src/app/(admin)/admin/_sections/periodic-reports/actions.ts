"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setPeriodicReportEnabled } from "@/modules/periodic-reports";
import { ApplicationError } from "@/server/errors";

// Turning a periodic report on or off from the administration (SPEC 2026-11-09-comunicacao-e-calendarios, 5.3 item 3;
// SF-251). The page to go back to is always the section; the result travels as a short code.

const PAGE = "/admin?section=periodic-reports";

export async function setPeriodicReportEnabledAction(formData: FormData): Promise<never> {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const enabled = field("enabled");
  let result = enabled === "true" ? "enabled" : "disabled";
  try {
    const { changed } = await setPeriodicReportEnabled({ kind: field("kind"), enabled });
    if (!changed) result = "unchanged";
  } catch (error) {
    if (!(error instanceof ApplicationError)) throw error;
    result = error.code === "CONFLICT" ? "conflict" : error.code === "VALIDATION_ERROR" ? "invalid" : "denied";
  }
  revalidatePath("/admin");
  redirect(`${PAGE}&reportSetting=${result}`);
}
