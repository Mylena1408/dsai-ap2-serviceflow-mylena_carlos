import { z } from "zod";
import { requireCurrentActor, type AuthorizationActor } from "@/server/authorization";
import { AuthorizationError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { offeredCategories, type NotificationCategory } from "../domain/email";
import type { NotificationPreferenceStore } from "./ports";

// Email preferences (SPEC 2026-11-01-notificacoes-email-preferencias, 5.1 and 5.6). The person is
// always the signed-in user: no input names a user, so nobody changes someone else's choice.

/**
 * The choice of each category offered to the person. "Relatórios" is there only for a manager, once a report kind is
 * on or they chose it before (SPEC 2026-11-09-comunicacao-e-calendarios, 5.1 item 4 and CA-REL-01; SF-250).
 */
export type EmailPreferences = Partial<Record<NotificationCategory, boolean>>;

const RECEIVERS = new Set(["REQUESTER", "ATTENDANT", "MANAGER"]);

/** Only the categories offered to the person (the other ones are refused like an unknown one). */
function preferencesSchema(offered: NotificationCategory[]) {
  return z
    .object({
      categories: z.array(z.enum(offered as [NotificationCategory, ...NotificationCategory[]])).max(offered.length),
    })
    .strict();
}

/** Administrators receive no notifications, so they have no preferences either. */
async function requirePreferenceOwner(): Promise<AuthorizationActor> {
  const actor = await requireCurrentActor();
  if (!RECEIVERS.has(actor.role)) {
    throw new AuthorizationError();
  }
  return actor;
}

async function offeredTo(actor: AuthorizationActor, enabled: ReadonlySet<NotificationCategory>, store: NotificationPreferenceStore) {
  // The setting is read only for a manager: the other pages stay exactly as they were.
  const kindEnabled = actor.role === "MANAGER" && store.reportKindEnabled ? await store.reportKindEnabled() : false;
  return offeredCategories(actor.role, { kindEnabled, chosen: enabled.has("REPORTS") });
}

export async function getEmailPreferences(store: NotificationPreferenceStore): Promise<EmailPreferences> {
  const actor = await requirePreferenceOwner();
  const enabled = await store.enabledCategories(actor.id);
  const offered = await offeredTo(actor, enabled, store);
  return Object.fromEntries(offered.map((category) => [category, enabled.has(category)])) as EmailPreferences;
}

/**
 * `categories` lists the categories with email on; every other offered one is turned off. A category not offered to
 * the person is refused, and its row is never written.
 */
export async function updateEmailPreferences(input: unknown, store: NotificationPreferenceStore): Promise<void> {
  const actor = await requirePreferenceOwner();
  const offered = await offeredTo(actor, await store.enabledCategories(actor.id), store);
  const { categories } = validateInput(preferencesSchema(offered), input);
  const enabled = new Set(categories);
  const choices = Object.fromEntries(offered.map((category) => [category, enabled.has(category)])) as EmailPreferences;
  await store.save(actor.id, choices, new Date());
}
