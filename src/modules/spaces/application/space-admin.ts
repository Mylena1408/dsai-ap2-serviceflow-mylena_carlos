import { activeStateAction } from "@/modules/audit";
import { assertCatalogSector, requireCatalogEditor } from "@/server/authorization";
import { ConflictError, NotFoundError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { activeStateSchema, entityIdSchema } from "@/shared/validation";
import type { SpaceRecord } from "../domain/space";
import type { SpaceStore, SpaceTransaction } from "./ports";
import { spaceInputSchema } from "./schemas";

// The registration of spaces (SPEC 2026-11-16-professores-e-tecnicos, part C item 1; decisions P5 and P6): the
// administrator for every sector and a holder of "Gerir serviços do setor" for their own sector, with the existing
// checks only (P17). Every change goes to the audit trail (CA-PRT-06).

export interface SpaceEditorView {
  /** The sector the person manages, or null for every sector. */
  sectorId: string | null;
  spaces: SpaceRecord[];
  sectors: Array<{ id: string; name: string }>;
}

export async function listSpacesForEditor(store: SpaceStore): Promise<SpaceEditorView> {
  const editor = await requireCatalogEditor();
  const [spaces, sectors] = await Promise.all([store.listSpaces(editor.sectorId), store.listSectors()]);
  return {
    sectorId: editor.sectorId,
    spaces,
    sectors: editor.sectorId === null ? sectors : sectors.filter(({ id }) => id === editor.sectorId),
  };
}

/** A name repeated in the sector is a conflict (rule 6.2.1). */
const free = <T>(value: T | null): T => {
  if (value === null) throw new ConflictError();
  return value;
};

export async function createSpace(input: unknown, store: SpaceStore): Promise<{ id: string }> {
  const editor = await requireCatalogEditor();
  const data = validateInput(spaceInputSchema, input);
  assertCatalogSector(editor, data.sectorId);
  return store.run(async (transaction) => {
    if (!(await transaction.sectorIsActive(data.sectorId))) throw new NotFoundError();
    return transaction.audited({ actor: editor.actor, action: "CREATED", entityType: "SPACE" }, async () =>
      free(await transaction.createSpace(data)),
    );
  });
}

/** A space the person manages: of their sector, or any one for the administrator. */
async function managedSpace(transaction: SpaceTransaction, sectorId: string | null, spaceId: string): Promise<SpaceRecord> {
  const space = await transaction.findSpace(spaceId);
  if (!space || (sectorId !== null && space.sectorId !== sectorId)) throw new NotFoundError();
  return space;
}

export async function updateSpace(spaceId: unknown, input: unknown, store: SpaceStore): Promise<{ id: string }> {
  const editor = await requireCatalogEditor();
  const id = validateInput(entityIdSchema, spaceId);
  const data = validateInput(spaceInputSchema, input);
  // Moving a space to a sector the person does not manage is refused like an unknown one.
  assertCatalogSector(editor, data.sectorId);
  return store.run(async (transaction) => {
    await managedSpace(transaction, editor.sectorId, id);
    if (!(await transaction.sectorIsActive(data.sectorId))) throw new NotFoundError();
    return transaction.audited({ actor: editor.actor, action: "UPDATED", entityType: "SPACE", entityId: id }, async () =>
      free(await transaction.updateSpace(id, data)),
    );
  });
}

/** Rule 6.2.2: deactivating hides the space from the reservations; its reservations stay, for the team to decide. */
export async function setSpaceActive(spaceId: unknown, isActive: unknown, store: SpaceStore): Promise<{ id: string }> {
  const editor = await requireCatalogEditor();
  const id = validateInput(entityIdSchema, spaceId);
  const active = validateInput(activeStateSchema, isActive);
  return store.run(async (transaction) => {
    const space = await managedSpace(transaction, editor.sectorId, id);
    if (space.isActive === active) return { id };
    return transaction.audited({ actor: editor.actor, action: activeStateAction(active), entityType: "SPACE", entityId: id }, async () =>
      free(await transaction.updateSpace(id, { isActive: active })),
    );
  });
}
