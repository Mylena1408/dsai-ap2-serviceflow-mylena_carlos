import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authorization = vi.hoisted(() => ({ requireCurrentActor: vi.fn() }));
vi.mock("@/server/authorization", () => authorization);

import { getAnnouncementHistory, type AnnouncementHistoryReader } from "@/modules/announcements/application/announcement-history";
import type { AnnouncementRecord } from "@/modules/announcements";
import { AnnouncementHistoryList, historyKind } from "@/app/_components/announcement-history";

// SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 4 (SF-239): the page "Avisos".

const NOW = new Date("2026-11-22T12:00:00.000Z");
const at = (iso: string) => new Date(iso);

const record = (overrides: Partial<AnnouncementRecord> = {}): AnnouncementRecord => ({
  id: "a",
  title: "Aviso",
  body: "Texto.",
  kind: "NOTICE",
  level: "INFO",
  audience: "ALL",
  audienceRole: null,
  audienceSectorId: null,
  startsAt: at("2026-11-20T12:00:00.000Z"),
  endsAt: at("2026-11-27T12:00:00.000Z"),
  leadHours: null,
  createdAt: at("2026-11-14T12:00:00.000Z"),
  ...overrides,
});

function reader(rows: AnnouncementRecord[]): AnnouncementHistoryReader {
  return { now: vi.fn(async () => NOW), list: vi.fn(async () => rows) };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorization.requireCurrentActor.mockResolvedValue({ id: "u1", role: "REQUESTER", sectorId: null, isActive: true });
});

describe("getAnnouncementHistory", () => {
  it("reads the last 90 days at the database's instant", async () => {
    const source = reader([]);
    await getAnnouncementHistory(source);
    expect(source.list).toHaveBeenCalledWith({ id: "u1", role: "REQUESTER", sectorId: null }, new Date(NOW.getTime() - 90 * 86_400_000), NOW);
  });

  it("lists the ones in force first, then the ended ones, with the state of each", async () => {
    const source = reader([
      record({ id: "ended", startsAt: at("2026-11-10T12:00:00.000Z"), endsAt: at("2026-11-12T12:00:00.000Z") }),
      record({ id: "current" }),
      record({ id: "scheduled", kind: "MAINTENANCE", level: "WARNING", startsAt: at("2026-11-23T01:00:00.000Z"), endsAt: at("2026-11-23T03:00:00.000Z"), leadHours: 24 }),
      record({ id: "in-progress", kind: "MAINTENANCE", level: "WARNING", startsAt: at("2026-11-22T11:00:00.000Z"), endsAt: at("2026-11-22T13:00:00.000Z"), leadHours: 24 }),
      record({ id: "future", startsAt: at("2026-11-25T12:00:00.000Z") }),
      record({ id: "other", audience: "ROLE", audienceRole: "MANAGER" }),
    ]);
    const items = await getAnnouncementHistory(source);
    expect(items.map(({ id, state }) => `${id}:${state}`)).toEqual([
      "scheduled:maintenance_scheduled",
      "in-progress:maintenance_in_progress",
      "current:current",
      "ended:ended",
    ]);
  });
});

describe("the page \"Avisos\"", () => {
  it("names the kind with the level of a notice", () => {
    expect(historyKind({ kind: "NOTICE", level: "WARNING" })).toBe("Aviso · Atenção");
    expect(historyKind({ kind: "MAINTENANCE", level: "WARNING" })).toBe("Manutenção");
  });

  it("shows each announcement with its state and period in the organization's time zone", () => {
    const html = renderToStaticMarkup(
      createElement(AnnouncementHistoryList, {
        items: [
          { ...record({ title: "Novo catálogo" }), state: "current" },
          { ...record({ id: "m", title: "Atualização", kind: "MAINTENANCE", level: "WARNING", leadHours: 24 }), state: "ended" },
        ],
      }),
    );
    expect(html).toContain('<article aria-label="Novo catálogo">');
    expect(html).toContain("Aviso · Informação · <strong>Em vigor</strong>");
    expect(html).toContain("Período: de 20/11/2026 09:00 a 27/11/2026 09:00");
    expect(html).toContain("Manutenção · <strong>Encerrado</strong>");
    expect(html).toContain("Janela: de 20/11/2026 09:00 a 27/11/2026 09:00");
  });

  it("explains an empty page", () => {
    expect(renderToStaticMarkup(createElement(AnnouncementHistoryList, { items: [] }))).toContain("Nenhum aviso em vigor nem encerrado nos últimos 90 dias.");
  });
});
