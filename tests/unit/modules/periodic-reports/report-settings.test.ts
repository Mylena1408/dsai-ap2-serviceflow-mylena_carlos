import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError, ValidationError } from "@/server/errors";

const authorization = vi.hoisted(() => ({ requireConfigurationAdministrator: vi.fn() }));
vi.mock("@/server/authorization", () => authorization);
vi.mock("@/app/(admin)/admin/_sections/periodic-reports/actions", () => ({ setPeriodicReportEnabledAction: vi.fn() }));

import {
  getPeriodicReportSettings,
  setPeriodicReportEnabled,
  settingsOf,
  type PeriodicReportSettingsStore,
  type PeriodicReportSettingsTransaction,
} from "@/modules/periodic-reports/application/report-settings";
import { PeriodicReportSettingsForm } from "@/app/(admin)/admin/_sections/periodic-reports/periodic-reports-section";

// SPEC 2026-11-09-comunicacao-e-calendarios, 5.3 item 3 (SF-251; CA-REL-01): only the administrator turns each kind on
// or off, each change in the audit trail; both start off.

const ADMIN = { id: "admin-1", role: "ADMIN", isActive: true, sectorId: null };

function memory(rows: Array<{ id: string; kind: "WEEKLY" | "MONTHLY"; isEnabled: boolean }> = []) {
  const audits: Array<{ action: string; entityId?: string }> = [];
  const transaction: PeriodicReportSettingsTransaction = {
    async audited(meta, change) {
      audits.push({ action: meta.action, entityId: meta.entityId });
      return change();
    },
    async find(kind) {
      const row = rows.find((item) => item.kind === kind);
      return row ? { id: row.id, isEnabled: row.isEnabled } : null;
    },
    async create(data) {
      const row = { id: `row-${data.kind}`, kind: data.kind, isEnabled: data.isEnabled };
      rows.push(row);
      return { id: row.id };
    },
    async update(id, data) {
      rows.find((item) => item.id === id)!.isEnabled = data.isEnabled;
      return { id };
    },
  };
  const store: PeriodicReportSettingsStore = { run: (work) => work(transaction) };
  return { store, rows, audits };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorization.requireConfigurationAdministrator.mockResolvedValue(ADMIN);
});

describe("the settings (5.3 item 3)", () => {
  it("start off: a kind without a row is off", async () => {
    expect(settingsOf([])).toEqual({ WEEKLY: false, MONTHLY: false });
    expect(await getPeriodicReportSettings({ settings: async () => [{ kind: "MONTHLY", isEnabled: true }] })).toEqual({ WEEKLY: false, MONTHLY: true });
  });

  it("the first choice creates the row and the next ones change it, each in the audit trail", async () => {
    const { store, rows, audits } = memory();
    expect(await setPeriodicReportEnabled({ kind: "WEEKLY", enabled: "true" }, store)).toEqual({ changed: true });
    expect(rows).toEqual([{ id: "row-WEEKLY", kind: "WEEKLY", isEnabled: true }]);
    expect(await setPeriodicReportEnabled({ kind: "WEEKLY", enabled: "false" }, store)).toEqual({ changed: true });
    expect(rows[0]!.isEnabled).toBe(false);
    expect(audits).toEqual([{ action: "CREATED", entityId: undefined }, { action: "UPDATED", entityId: "row-WEEKLY" }]);
  });

  it("choosing the state a kind already has changes nothing and writes no audit entry", async () => {
    const { store, rows, audits } = memory([{ id: "m", kind: "MONTHLY", isEnabled: true }]);
    expect(await setPeriodicReportEnabled({ kind: "MONTHLY", enabled: "true" }, store)).toEqual({ changed: false });
    // Turning off a kind never chosen is also nothing: it is already off.
    expect(await setPeriodicReportEnabled({ kind: "WEEKLY", enabled: "false" }, store)).toEqual({ changed: false });
    expect(rows).toHaveLength(1);
    expect(audits).toEqual([]);
  });

  it("refuses an unknown kind, a value other than true or false, and another field", async () => {
    const { store } = memory();
    for (const input of [{ kind: "DAILY", enabled: "true" }, { kind: "WEEKLY", enabled: "yes" }, { kind: "WEEKLY", enabled: "true", sectorId: "x" }]) {
      await expect(setPeriodicReportEnabled(input, store)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("only the administrator reads and changes them", async () => {
    authorization.requireConfigurationAdministrator.mockRejectedValue(new AuthorizationError());
    const { store, rows } = memory();
    const reader = { settings: vi.fn(async () => []) };
    await expect(getPeriodicReportSettings(reader)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setPeriodicReportEnabled({ kind: "WEEKLY", enabled: "true" }, store)).rejects.toBeInstanceOf(AuthorizationError);
    expect(reader.settings).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });
});

describe("the form of the section", () => {
  it("shows each kind's state with the button that changes it", () => {
    const html = renderToStaticMarkup(createElement(PeriodicReportSettingsForm, { settings: { WEEKLY: true, MONTHLY: false } }));
    expect(html).toContain("<strong>Relatório semanal</strong>: ligado.");
    expect(html).toContain('<input type="hidden" name="enabled" value="false"/>');
    expect(html).toContain(">Desligar relatório semanal</button>");
    expect(html).toContain("<strong>Relatório mensal</strong>: desligado.");
    expect(html).toContain(">Ligar relatório mensal</button>");
    expect(html).not.toContain('role="status"');
  });

  it("tells the result of the last change", () => {
    const off = { WEEKLY: false, MONTHLY: false };
    expect(renderToStaticMarkup(createElement(PeriodicReportSettingsForm, { settings: off, result: "disabled" }))).toContain(
      "Relatório desligado. Os já gerados continuam na lista.",
    );
    expect(renderToStaticMarkup(createElement(PeriodicReportSettingsForm, { settings: off, result: "denied" }))).toContain('role="alert"');
    expect(renderToStaticMarkup(createElement(PeriodicReportSettingsForm, { settings: off, result: "other" }))).not.toContain("feedback");
  });
});
