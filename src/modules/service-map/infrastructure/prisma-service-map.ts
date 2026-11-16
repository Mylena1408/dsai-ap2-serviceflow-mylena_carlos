import type { PrismaClient } from "@prisma/client";
import type { RequesterKind } from "@/shared/requester-kinds";
import type { MapService } from "../domain/service-map";

// SPEC 2026-11-15-mapa-de-servicos, rule 1 (SF-273): only what the requester can ask for. Services active with an
// active category and sector (the catalog's rule), their active stages and documents, the published articles and the
// names of the approval sectors. Read only.

/** The kind of the requester reading the map; null for an identifier that is not a person's. */
export async function readRequesterKind(database: PrismaClient, userId: string): Promise<RequesterKind | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const user = await database.user.findUnique({ where: { id: userId }, select: { requesterKind: true } });
  return user?.requesterKind ?? null;
}

export async function readPublishedMapServices(database: PrismaClient, kind?: RequesterKind): Promise<MapService[]> {
  const [services, sectors] = await Promise.all([
    database.service.findMany({
      // SPEC 2026-11-16-tipos-de-solicitante, rule 2: only the services offered to the reader's kind.
      where: { isActive: true, category: { isActive: true }, sector: { isActive: true }, ...(kind ? { offeredTo: { has: kind } } : {}) },
      select: {
        id: true,
        name: true,
        description: true,
        slaHours: true,
        requiresApproval: true,
        approvalSectorIds: true,
        approvalConditionFieldId: true,
        category: { select: { name: true } },
        sector: { select: { name: true } },
        stages: { where: { isActive: true }, orderBy: { position: "asc" }, select: { name: true, conditionFieldId: true } },
        documentRequirements: { where: { isActive: true }, orderBy: { position: "asc" }, select: { name: true, isRequired: true } },
        knowledgeArticles: { where: { isPublished: true }, orderBy: [{ position: "asc" }, { title: "asc" }], select: { id: true, title: true } },
      },
    }),
    database.sector.findMany({ select: { id: true, name: true } }),
  ]);
  const sectorName = new Map(sectors.map(({ id, name }) => [id, name]));
  return services.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    categoryName: service.category.name,
    sectorName: service.sector.name,
    slaHours: service.slaHours,
    requiresApproval: service.requiresApproval,
    approvalConditional: service.approvalConditionFieldId !== null,
    approvalSectorNames: service.approvalSectorIds.map((id) => sectorName.get(id) ?? "outro setor"),
    stages: service.stages.map(({ name, conditionFieldId }) => ({ name, conditional: conditionFieldId !== null })),
    documents: service.documentRequirements.map(({ name, isRequired }) => ({ name, required: isRequired })),
    articles: service.knowledgeArticles,
  }));
}
