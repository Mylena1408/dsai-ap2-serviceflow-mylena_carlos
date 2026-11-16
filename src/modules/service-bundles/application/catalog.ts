import { requirePublishedCatalogReader } from "@/server/authorization";
import { NotFoundError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { entityIdSchema } from "@/shared/validation";
import { DEFAULT_REQUESTER_KIND, isOfferedTo, type RequesterKind } from "@/shared/requester-kinds";
import { bundleAvailability, type BundleRecord, type BundleServiceState } from "../domain/bundle";

// Bundles in the requester's catalog (SPEC 2026-11-07-operacao-e-automacao, 3.3 items 2 and 3,
// decision H20): only active bundles whose services can all be opened now; any other is "not found",
// as an unpublished service.

export interface CatalogBundle {
  id: string;
  name: string;
  description: string | null;
  /** In the bundle's order. */
  services: Array<{ id: string; name: string; sectorName: string }>;
}

export interface CatalogBundleReader {
  listActiveBundles(): Promise<BundleRecord[]>;
  findBundle(bundleId: string): Promise<BundleRecord | null>;
  serviceStates(serviceIds: readonly string[]): Promise<BundleServiceState[]>;
  /** SPEC 2026-11-16-tipos-de-solicitante: the reader's kind; null for anyone who is not a requester. */
  requesterKindOf?(userId: string): Promise<RequesterKind | null>;
}

function asCatalogBundle(bundle: BundleRecord, states: readonly BundleServiceState[], kind: RequesterKind): CatalogBundle | null {
  if (!bundleAvailability(bundle, states).openable) return null;
  // Decision T9: a bundle is shown only when every one of its services is offered to the person's kind.
  const offered = new Map(states.map((state) => [state.id, isOfferedTo(state.offeredTo, kind)]));
  if (bundle.serviceIds.some((id) => offered.get(id) !== true)) return null;
  const byId = new Map(states.map((state) => [state.id, state]));
  return {
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    services: bundle.serviceIds.map((id) => {
      const state = byId.get(id)!;
      return { id, name: state.name, sectorName: state.sectorName };
    }),
  };
}

async function readerKind(reader: CatalogBundleReader): Promise<RequesterKind> {
  const actor = await requirePublishedCatalogReader();
  return (await reader.requesterKindOf?.(actor.id)) ?? DEFAULT_REQUESTER_KIND;
}

export async function listCatalogBundles(reader: CatalogBundleReader): Promise<CatalogBundle[]> {
  const kind = await readerKind(reader);
  const bundles = await reader.listActiveBundles();
  const states = await reader.serviceStates([...new Set(bundles.flatMap(({ serviceIds }) => serviceIds))]);
  return bundles.flatMap((bundle) => asCatalogBundle(bundle, states, kind) ?? []);
}

export async function getCatalogBundle(bundleId: unknown, reader: CatalogBundleReader): Promise<CatalogBundle> {
  const kind = await readerKind(reader);
  const id = validateInput(entityIdSchema, bundleId);
  const bundle = await reader.findBundle(id);
  const found = bundle ? asCatalogBundle(bundle, await reader.serviceStates(bundle.serviceIds), kind) : null;
  if (!found) {
    throw new NotFoundError();
  }
  return found;
}
