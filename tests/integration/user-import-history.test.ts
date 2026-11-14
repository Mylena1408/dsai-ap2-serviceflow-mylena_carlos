import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";
import "./fixtures";
import { createDomainSector, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 4 (SF-244; CA-IMP-03 for the history and the error report).

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/auth", () => session);
vi.mock("@/server/db", async () => {
  const { prisma } = await import("./fixtures");
  return { prisma };
});

import { applyUserImport, listUserImports, previewUserImport } from "@/modules/user-import";
import { GET } from "@/app/api/user-imports/[importId]/report.csv/route";

type Person = { id: string; name: string; role: Role; sectorId: string | null };
const as = (person: Person) => session.getCurrentUser.mockResolvedValue({ ...person, isActive: true, email: `${person.id}@example.test` });
const bytes = (text: string) => new TextEncoder().encode(text);

async function importFile(text: string) {
  const preview = await previewUserImport(bytes(text));
  if (!preview.ok) throw new Error(preview.error);
  return applyUserImport({ content: preview.content, digest: preview.digest });
}

const download = (importId: string) =>
  GET(new Request(`https://serviceflow.test/api/user-imports/${importId}/report.csv`), { params: Promise.resolve({ importId }) });

describe("the history of the imports (SF-244)", () => {
  it("lists the imports, most recent first, with the author and the counts", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    as(admin);
    const first = await importFile("nome;email;perfil;setor\nAna;hist1@x.test;solicitante;");
    const second = await importFile("nome;email;perfil;setor\nBia;hist2@x.test;solicitante;\nCaio;;solicitante;");

    const history = await listUserImports();
    expect(history.map(({ id }) => id).slice(0, 2)).toEqual([second.importId, first.importId]);
    expect(history[0]).toMatchObject({ actorName: admin.name, createdCount: 1, skippedCount: 0, errorCount: 1 });
  });

  it("gives the administrator the error report in CSV, without names or e-mails", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    await createDomainUser({ role: "REQUESTER", email: "existe@hist.test" });
    as(admin);
    const result = await importFile("nome;email;perfil;setor\nJá Existe;existe@hist.test;solicitante;\nChefe Novo;chefe@hist.test;=chefe();");

    const response = await download(result.importId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="serviceflow-importacao-\d{4}-\d{2}-\d{2}-\d{4}\.csv"$/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const content = await response.text();
    expect(content.split(String.fromCharCode(13, 10))).toEqual([
      "Linha;Resultado;Motivos;Perfil;Setor",
      "2;Ignorada;e-mail já existe;solicitante;",
      "3;Com erro;perfil desconhecido;'=chefe();",
      "",
    ]);
    expect(content).not.toMatch(/Já Existe|existe@hist|Chefe Novo|chefe@hist/);
  });

  it("answers 'não encontrada' for an unknown or invalid import, and refuses a manager", async () => {
    const admin = await createDomainUser({ role: "ADMIN" });
    as(admin);
    const result = await importFile("nome;email;perfil;setor\nAna;hist3@x.test;solicitante;");
    expect((await download(randomUUID())).status).toBe(404);
    expect(await (await download("x")).text()).toBe("Importação não encontrada.");

    const sector = await createDomainSector();
    const manager = await createDomainUser({ role: "MANAGER", sectorId: sector.id });
    as({ ...manager, role: "MANAGER" });
    const refused = await download(result.importId);
    expect(refused.status).toBe(403);
    expect(await refused.text()).toBe("Só o administrador baixa o relatório de uma importação.");
    await expect(listUserImports()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
