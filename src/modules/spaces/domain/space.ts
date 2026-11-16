// Spaces of a sector: classrooms, laboratories, auditoriums and others (SPEC 2026-11-16-professores-e-tecnicos, part C;
// decisions P5 and P6). The rules here have no database: the module's other layers use them, and so do the screens.

export const SPACE_KINDS = ["CLASSROOM", "LABORATORY", "AUDITORIUM", "OTHER"] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

export const SPACE_KIND_LABELS: Record<SpaceKind, string> = {
  CLASSROOM: "Sala de aula",
  LABORATORY: "Laboratório",
  AUDITORIUM: "Auditório",
  OTHER: "Outro",
};

/** P5: a reservation is confirmed at once, or waits for the sector's team. */
export const SPACE_CONFIRMATIONS = ["SECTOR", "AUTOMATIC"] as const;
export type SpaceConfirmation = (typeof SPACE_CONFIRMATIONS)[number];

export const SPACE_CONFIRMATION_LABELS: Record<SpaceConfirmation, string> = {
  SECTOR: "Pelo setor",
  AUTOMATIC: "Automática",
};

/** Rule 6.2.1 and the migration's CHECKs. */
export const MIN_SPACE_CAPACITY = 1;
export const MAX_SPACE_CAPACITY = 1000;
export const MAX_SPACE_NAME = 120;
export const MAX_SPACE_LOCATION = 200;
export const MAX_SPACE_RESOURCES = 500;

export interface SpaceRecord {
  id: string;
  name: string;
  kind: SpaceKind;
  sectorId: string;
  sectorName: string;
  capacity: number;
  location: string;
  resources: string;
  confirmation: SpaceConfirmation;
  isActive: boolean;
}

/** What a space form sends, once validated (the sector of the record and the screen's fields). */
export interface SpaceData {
  name: string;
  kind: SpaceKind;
  sectorId: string;
  capacity: number;
  location: string;
  resources: string;
  confirmation: SpaceConfirmation;
}

/** Part C item 2: the filters of the page "Espaços". */
export interface SpaceFilter {
  kind: SpaceKind | null;
  minCapacity: number | null;
  sectorId: string | null;
}

export const NO_SPACE_FILTER: SpaceFilter = { kind: null, minCapacity: null, sectorId: null };

/** Rule 6.2.2: only active spaces are reserved; the filters narrow them; by sector, then name. */
export function filterSpaces(spaces: readonly SpaceRecord[], filter: SpaceFilter): SpaceRecord[] {
  return spaces
    .filter((space) => space.isActive)
    .filter((space) => filter.kind === null || space.kind === filter.kind)
    .filter((space) => filter.minCapacity === null || space.capacity >= filter.minCapacity)
    .filter((space) => filter.sectorId === null || space.sectorId === filter.sectorId)
    .sort(
      (left, right) =>
        left.sectorName.localeCompare(right.sectorName, "pt-BR") || left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id),
    );
}

/** The filter as the page's address gives it: unknown or empty values mean no filter. */
export function spaceFilterOf(raw: { kind?: unknown; capacity?: unknown; sector?: unknown }): SpaceFilter {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const kind = text(raw.kind);
  const capacity = Number.parseInt(text(raw.capacity), 10);
  const sector = text(raw.sector);
  return {
    kind: (SPACE_KINDS as readonly string[]).includes(kind) ? (kind as SpaceKind) : null,
    minCapacity: Number.isInteger(capacity) && capacity >= MIN_SPACE_CAPACITY && capacity <= MAX_SPACE_CAPACITY ? capacity : null,
    sectorId: /^[0-9a-f-]{36}$/i.test(sector) ? sector.toLowerCase() : null,
  };
}

/** "Sala 101 · Sala de aula · 40 lugares", for lists and notices. */
export function spaceSummary(space: Pick<SpaceRecord, "name" | "kind" | "capacity">): string {
  return `${space.name} · ${SPACE_KIND_LABELS[space.kind]} · ${space.capacity === 1 ? "1 lugar" : `${space.capacity} lugares`}`;
}
