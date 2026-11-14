import { z } from "zod";
import type { AuditScope } from "@/modules/audit";
import { requireConfigurationAdministrator } from "@/server/authorization";
import { validateInput } from "@/server/validation";
import { PERIODIC_REPORT_KINDS, type PeriodicReportKind } from "../domain/periodic-report";

// Turning the periodic reports on and off (SPEC 2026-11-09-comunicacao-e-calendarios, 5.3 item 3; SF-251): only the
// administrator, each change in the audit trail. Both kinds start off (a kind without a row is off); turning one off
// keeps every report already generated.

export type PeriodicReportSettings = Record<PeriodicReportKind, boolean>;

export interface PeriodicReportSettingsReader {
  /** The kinds with a row, on or off. */
  settings(): Promise<Array<{ kind: PeriodicReportKind; isEnabled: boolean }>>;
}

export interface PeriodicReportSettingsTransaction extends AuditScope {
  find(kind: PeriodicReportKind): Promise<{ id: string; isEnabled: boolean } | null>;
  create(data: { kind: PeriodicReportKind; isEnabled: boolean; updatedById: string }): Promise<{ id: string }>;
  update(id: string, data: { isEnabled: boolean; updatedById: string }): Promise<{ id: string }>;
}

export interface PeriodicReportSettingsStore {
  run<T>(work: (transaction: PeriodicReportSettingsTransaction) => Promise<T>): Promise<T>;
}

const settingInputSchema = z
  .object({
    kind: z.enum(PERIODIC_REPORT_KINDS),
    enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  })
  .strict();

export function settingsOf(rows: Array<{ kind: PeriodicReportKind; isEnabled: boolean }>): PeriodicReportSettings {
  const on = new Set(rows.filter(({ isEnabled }) => isEnabled).map(({ kind }) => kind));
  return Object.fromEntries(PERIODIC_REPORT_KINDS.map((kind) => [kind, on.has(kind)])) as PeriodicReportSettings;
}

export async function getPeriodicReportSettings(reader: PeriodicReportSettingsReader): Promise<PeriodicReportSettings> {
  await requireConfigurationAdministrator();
  return settingsOf(await reader.settings());
}

/**
 * Turns a kind on or off. Choosing the state it already has changes nothing and writes no audit entry; the first
 * choice of a kind creates its row ("Criou" in the audit trail), the next ones change it ("Alterou").
 */
export async function setPeriodicReportEnabled(input: unknown, store: PeriodicReportSettingsStore): Promise<{ changed: boolean }> {
  const actor = await requireConfigurationAdministrator();
  const { kind, enabled } = validateInput(settingInputSchema, input);
  return store.run(async (transaction) => {
    const current = await transaction.find(kind);
    if ((current?.isEnabled ?? false) === enabled) return { changed: false };
    if (!current) {
      await transaction.audited({ actor, action: "CREATED", entityType: "PERIODIC_REPORT_SETTING" }, () =>
        transaction.create({ kind, isEnabled: enabled, updatedById: actor.id }),
      );
    } else {
      await transaction.audited({ actor, action: "UPDATED", entityType: "PERIODIC_REPORT_SETTING", entityId: current.id }, () =>
        transaction.update(current.id, { isEnabled: enabled, updatedById: actor.id }),
      );
    }
    return { changed: true };
  });
}
