import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const announcements = vi.hoisted(() => ({ getAnnouncementHistory: vi.fn() }));
vi.mock("@/modules/announcements", async (importOriginal) => ({ ...(await importOriginal<object>()), ...announcements }));

import { AnnouncementsLink } from "@/app/_components/announcement-history";
import { AuthenticationError } from "@/server/errors";

// SPEC 2026-11-09-comunicacao-e-calendarios, 3.1 item 4 (SF-239; CA-AVI-01): "Avisos" in an area's navigation only
// for a person who has announcements on the page.

const render = async () => {
  const element = await AnnouncementsLink();
  return element ? renderToStaticMarkup(element) : "";
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the link \"Avisos\"", () => {
  it("shows with some announcement on the page", async () => {
    announcements.getAnnouncementHistory.mockResolvedValue([{ id: "a" }]);
    expect(await render()).toBe('<a href="/announcements">Avisos</a>');
  });

  it("does not show without announcements, so the screens do not change", async () => {
    announcements.getAnnouncementHistory.mockResolvedValue([]);
    expect(await render()).toBe("");
  });

  it("does not show nor break the page when reading fails", async () => {
    announcements.getAnnouncementHistory.mockRejectedValue(new AuthenticationError());
    expect(await render()).toBe("");
  });
});
