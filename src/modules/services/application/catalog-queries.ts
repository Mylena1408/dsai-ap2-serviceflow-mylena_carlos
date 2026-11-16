import { requirePublishedCatalogReader } from "@/server/authorization";
import { NotFoundError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { entityIdSchema } from "@/shared/validation";
import { DEFAULT_REQUESTER_KIND, audiencesFor, type RequesterKind, type ServiceAudience } from "@/shared/requester-kinds";
import type { PublishedService } from "../domain/service";
import type { PublishedCatalogRepository } from "./ports";

/** The audiences the current requester may ask for (SPEC 2026-11-16-tipos-de-solicitante, rule 2). */
async function readerAudiences(repository: PublishedCatalogRepository): Promise<ServiceAudience[]> {
  const actor = await requirePublishedCatalogReader();
  return audiencesFor((await repository.requesterKindOf(actor.id)) ?? DEFAULT_REQUESTER_KIND);
}

/** The kind of the requester reading the catalog (4.2 item 1): the subsection the page shows. */
export async function catalogReaderKind(repository: PublishedCatalogRepository): Promise<RequesterKind> {
  const actor = await requirePublishedCatalogReader();
  return (await repository.requesterKindOf(actor.id)) ?? DEFAULT_REQUESTER_KIND;
}

export async function listPublishedServices(
  repository: PublishedCatalogRepository,
): Promise<PublishedService[]> {
  return repository.listPublished(await readerAudiences(repository));
}

export async function getPublishedService(
  id: unknown,
  repository: PublishedCatalogRepository,
): Promise<PublishedService> {
  const audiences = await readerAudiences(repository);
  const serviceId = validateInput(entityIdSchema, id);
  // A service of another audience is "not found", like an unavailable one (rule 5).
  const service = await repository.findPublished(serviceId, audiences);

  if (!service) {
    throw new NotFoundError();
  }

  return service;
}
