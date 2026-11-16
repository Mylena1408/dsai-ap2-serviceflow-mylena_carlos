import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "./fixtures";
import { createDomainCategory, createDomainSector, createDomainService, createDomainUser } from "./domain-fixtures";

// SPEC 2026-11-15-mapa-de-servicos, rule 1 and CA-MAP-01 to 03 (SF-273): the map reads only what the requester can
// ask for, from the real configuration, and only a requester reads it.

const authorization = vi.hoisted(() => ({ requirePublishedCatalogReader: vi.fn() }));
vi.mock("@/server/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/authorization")>()),
  requirePublishedCatalogReader: authorization.requirePublishedCatalogReader,
}));

import { getServiceMap } from "@/modules/service-map";
import { AuthorizationError } from "@/server/errors";

const asRequester = () =>
  authorization.requirePublishedCatalogReader.mockResolvedValue({ id: "requester", role: "REQUESTER", sectorId: null, isActive: true });

async function article(serviceId: string, title: string, isPublished: boolean) {
  const author = await createDomainUser({ role: "ADMIN" });
  return prisma.knowledgeArticle.create({
    data: { serviceId, title, body: "Passo a passo do artigo de teste.", isPublished, createdById: author.id, updatedById: author.id, createdAt: new Date(), updatedAt: new Date() },
  });
}

describe("the requester's map of services", () => {
  it("brings only published services, stages, documents and articles, with the approval sectors by name", async () => {
    asRequester();
    const category = await createDomainCategory();
    const own = await createDomainSector();
    const approver = await createDomainSector();
    const inactiveSector = await createDomainSector(false);
    const simple = await createDomainService({ categoryId: category.id, sectorId: own.id });
    const approved = await createDomainService({ categoryId: category.id, sectorId: own.id });
    await prisma.service.update({ where: { id: approved.id }, data: { requiresApproval: true, approvalSectorIds: [approver.id] } });
    await prisma.serviceStage.createMany({
      data: [
        { serviceId: approved.id, name: `Cotação ${randomUUID().slice(0, 6)}`, position: 1 },
        { serviceId: approved.id, name: `Entrega ${randomUUID().slice(0, 6)}`, position: 2 },
        { serviceId: approved.id, name: `Antiga ${randomUUID().slice(0, 6)}`, position: 3, isActive: false },
      ],
    });
    await prisma.serviceDocumentRequirement.createMany({
      data: [
        { serviceId: approved.id, name: "Orçamento", isRequired: true, acceptedFormats: ["PDF"], position: 1 },
        { serviceId: approved.id, name: "Retirado", isRequired: false, acceptedFormats: ["PDF"], position: 2, isActive: false },
      ],
    });
    const published = await article(simple.id, `Resolva sozinho ${randomUUID().slice(0, 6)}`, true);
    await article(simple.id, `Rascunho ${randomUUID().slice(0, 6)}`, false);
    const hidden = await createDomainService({ categoryId: category.id, sectorId: own.id, isActive: false });
    const hiddenBySector = await createDomainService({ categoryId: category.id, sectorId: inactiveSector.id });
    await article(hiddenBySector.id, `Artigo de serviço fora do catálogo ${randomUUID().slice(0, 6)}`, true);

    const map = await getServiceMap(prisma);
    const all = [...map.attendance, ...map.specialized].flatMap((entry) => (entry.kind === "service" ? [entry] : []));
    const ids = all.map(({ service }) => service.id);
    expect(ids).toContain(simple.id);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(hidden.id);
    expect(ids).not.toContain(hiddenBySector.id);

    const simpleEntry = map.attendance.find(({ service }) => service.id === simple.id)!;
    expect(simpleEntry.processes).toBe(1);
    const approvedEntry = all.find(({ service }) => service.id === approved.id)!;
    expect(approvedEntry.group).toBe("specialized");
    expect(approvedEntry.steps.map(({ kind, sectorName }) => `${kind} ${sectorName}`)).toEqual([
      `approval ${approver.name}`,
      `attendance ${own.name}`,
      `attendance ${own.name}`,
    ]);
    expect(approvedEntry.service.documents).toEqual([{ name: "Orçamento", required: true }]);
    expect(map.links).toContainEqual({ from: approver.name, to: own.name, kind: "approval", through: [approved.name] });

    // Only the published article of a published service (CA-MAP-03).
    const articles = map.selfService.articles.filter(({ serviceId }) => serviceId === simple.id || serviceId === hiddenBySector.id);
    expect(articles).toEqual([{ id: published.id, title: published.title, serviceId: simple.id, serviceName: simple.name }]);
  });

  it("is refused to anyone who is not a requester (CA-MAP-01)", async () => {
    authorization.requirePublishedCatalogReader.mockRejectedValue(new AuthorizationError());
    await expect(getServiceMap(prisma)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
