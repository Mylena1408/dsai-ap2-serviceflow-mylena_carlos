import type { SpaceKind } from "./space";

// Exam allocations (SPEC 2026-11-16-professores-e-tecnicos, part E; decision P13): a professor asks a sector for spaces
// for an exam; the sector's team allocates one or more spaces that hold the students and are free at that time.

export const EXAM_SPACE_KINDS = ["CLASSROOM", "LABORATORY"] as const satisfies readonly SpaceKind[];
export type ExamSpaceKind = (typeof EXAM_SPACE_KINDS)[number];

export const EXAM_STATUSES = ["PENDING", "ALLOCATED", "REFUSED", "CANCELLED"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  PENDING: "Aguardando alocação",
  ALLOCATED: "Alocada",
  REFUSED: "Recusada",
  CANCELLED: "Cancelada",
};

/** The migration's CHECK: 1 to 5,000 students. */
export const MIN_EXAM_STUDENTS = 1;
export const MAX_EXAM_STUDENTS = 5000;
export const MAX_COURSE = 120;
export const MAX_CLASS_GROUP = 60;
export const MAX_EXAM_NOTES = 500;
/** At most this many spaces in one allocation. */
export const MAX_EXAM_SPACES = 12;

export interface CandidateSpace {
  id: string;
  name: string;
  capacity: number;
}

/** Rule 8.2.1: the spaces chosen hold every student. */
export function holdsStudents(spaces: readonly Pick<CandidateSpace, "capacity">[], students: number): boolean {
  return spaces.reduce((total, space) => total + space.capacity, 0) >= students;
}

/** The search stops after this many combinations and keeps the best found (the lists are small in practice). */
const SEARCH_LIMIT = 200_000;

/**
 * Rule 8.2.2: the suggestion. Fewer spaces first; among combinations with as many spaces, the smallest number of empty
 * places; then by names, so the same data always gives the same suggestion. Null when not even every space together
 * holds the students.
 */
export function suggestSpaces(candidates: readonly CandidateSpace[], students: number): CandidateSpace[] | null {
  const pool = [...candidates]
    .filter((space) => space.capacity > 0)
    .sort((left, right) => right.capacity - left.capacity || left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id));
  if (!holdsStudents(pool, students)) return null;

  // The largest k spaces are the best chance for k spaces: the first k where they hold everyone is the minimum.
  let size = 1;
  while (size <= pool.length && pool.slice(0, size).reduce((total, space) => total + space.capacity, 0) < students) size += 1;
  const count = Math.min(size, MAX_EXAM_SPACES);

  let best: CandidateSpace[] | null = null;
  let bestWaste = Number.POSITIVE_INFINITY;
  let visited = 0;
  const chosen: CandidateSpace[] = [];

  // Depth-first over combinations of `count` spaces, largest first, cutting branches that cannot reach the students.
  const search = (from: number, total: number) => {
    if (visited >= SEARCH_LIMIT) return;
    visited += 1;
    if (chosen.length === count) {
      const waste = total - students;
      if (waste >= 0 && waste < bestWaste) {
        bestWaste = waste;
        best = [...chosen];
      }
      return;
    }
    const missing = count - chosen.length;
    for (let index = from; index <= pool.length - missing; index += 1) {
      // What the next `missing` spaces from here can add at most (the pool is sorted by capacity).
      const reach = pool.slice(index, index + missing).reduce((sum, space) => sum + space.capacity, 0);
      if (total + reach < students) return;
      chosen.push(pool[index]!);
      search(index + 1, total + pool[index]!.capacity);
      chosen.pop();
      if (bestWaste === 0) return;
    }
  };
  search(0, 0);
  if (best === null) return null;
  return [...(best as CandidateSpace[])].sort((left, right) => left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id));
}

/** How many of the students go to each space, filling them in order, for the reservations' "attendees". */
export function seatsPerSpace(spaces: readonly CandidateSpace[], students: number): Map<string, number> {
  const seats = new Map<string, number>();
  let left = students;
  for (const space of spaces) {
    const here = Math.max(1, Math.min(space.capacity, left));
    seats.set(space.id, here);
    left = Math.max(0, left - here);
  }
  return seats;
}

export interface ExamRecord {
  id: string;
  professorId: string;
  professorName: string;
  sectorId: string;
  sectorName: string;
  course: string;
  classGroup: string;
  startsAt: Date;
  endsAt: Date;
  students: number;
  spaceKind: ExamSpaceKind;
  notes: string;
  status: ExamStatus;
  refusalNote: string | null;
  cancelNote: string | null;
  /** The spaces of an allocation, by name. */
  spaces: Array<{ id: string; name: string; capacity: number }>;
}

/** "Cálculo I — Turma A", for lists and notices. */
export function examTitle(exam: Pick<ExamRecord, "course" | "classGroup">): string {
  return `${exam.course} — ${exam.classGroup}`;
}

/** P13: the professor cancels a pending or allocated exam until it starts. */
export function canCancelExam(exam: Pick<ExamRecord, "status" | "startsAt">, now: Date): boolean {
  return (exam.status === "PENDING" || exam.status === "ALLOCATED") && exam.startsAt.getTime() > now.getTime();
}

/** P13: the sector's team allocates or refuses a pending exam that has not started. */
export function canDecideExam(exam: Pick<ExamRecord, "status" | "startsAt">, now: Date): boolean {
  return exam.status === "PENDING" && exam.startsAt.getTime() > now.getTime();
}
