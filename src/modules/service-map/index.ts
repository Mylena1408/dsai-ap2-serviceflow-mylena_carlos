// The requester's map of services (SPEC 2026-11-15-mapa-de-servicos; SF-273): published configuration only, read only.
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { requirePublishedCatalogReader } from "@/server/authorization";
import { listCatalogBundles } from "@/modules/service-bundles";
import { buildServiceMap, type MapBundle, type ServiceMap } from "./domain/service-map";
import { readPublishedMapServices } from "./infrastructure/prisma-service-map";

export {
  ACCOUNT_ACTIONS,
  buildServiceMap,
  bundleEntry,
  groupOf,
  reasonsOf,
  sectorLinks,
  serviceEntry,
  stepsOf,
  type MapBundle,
  type MapBundleEntry,
  type MapGroup,
  type MapService,
  type MapServiceEntry,
  type MapStep,
  type SectorLink,
  type ServiceMap,
} from "./domain/service-map";

/**
 * The map of what the requester can ask for now: published services and the bundles the catalog shows. Like the
 * catalog, only a requester reads it (CA-MAP-01), checked here too and not only by the page.
 */
export async function getServiceMap(database: PrismaClient = prisma): Promise<ServiceMap> {
  await requirePublishedCatalogReader();
  const [services, bundles] = await Promise.all([readPublishedMapServices(database), listCatalogBundles(database)]);
  const mapBundles: MapBundle[] = bundles.map(({ id, name, description, services: bundleServices }) => ({
    id,
    name,
    description: description ?? null,
    services: bundleServices,
  }));
  return buildServiceMap(services, mapBundles);
}
