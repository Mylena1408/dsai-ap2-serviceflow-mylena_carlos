import { emailSchema } from "@/shared/validation";
import { parseCsv } from "./csv";

// Importing people from a CSV file (SPEC 2026-11-09-comunicacao-e-calendarios, part B, 4.3 items 1 and 2; decision K1;
// SF-241): the file's rules and each line's outcome. Nothing here writes; the preview (SF-242) and the application
// (SF-243) use these rules with the database of the moment.

export const MAX_IMPORT_BYTES = 200 * 1024;
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_NAME_LENGTH = 120;

/** The columns of the file, in the order of the model (4.1 item 1). */
export const IMPORT_COLUMNS = ["nome", "email", "perfil", "setor"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export type ImportRole = "ADMIN" | "MANAGER" | "ATTENDANT" | "REQUESTER";

/** Why a whole file is refused. */
export type ImportFileError =
  | "too_big"
  | "not_utf8"
  | "unterminated_quote"
  | "no_header"
  | "missing_column"
  | "repeated_column"
  | "unknown_column"
  | "no_rows"
  | "too_many_rows";

/** Why a line is an error. */
export type ImportLineError =
  | "field_count"
  | "name_missing"
  | "name_too_long"
  | "email_invalid"
  | "email_repeated"
  | "role_invalid"
  | "sector_required"
  | "sector_not_allowed"
  | "sector_unknown";

export interface ImportRow {
  /** The file's line (1 is the header). */
  line: number;
  values: Record<ImportColumn, string>;
  /** Set when the line does not have as many fields as the header. */
  fieldCountMismatch: boolean;
}

export type ImportFileResult = { ok: true; rows: ImportRow[] } | { ok: false; error: ImportFileError; line?: number };

/** A key for names: trimmed, lower case, without accents. */
export function importKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

const COLUMN_ALIASES: Record<string, ImportColumn> = { nome: "nome", email: "email", "e-mail": "email", perfil: "perfil", setor: "setor" };

const ROLE_ALIASES: Record<string, ImportRole> = {
  administrador: "ADMIN",
  admin: "ADMIN",
  gestor: "MANAGER",
  manager: "MANAGER",
  atendente: "ATTENDANT",
  attendant: "ATTENDANT",
  solicitante: "REQUESTER",
  requester: "REQUESTER",
};

/** 4.3 item 2: one of the four roles, by its Portuguese name or its code. */
export function parseImportRole(value: string): ImportRole | null {
  return ROLE_ALIASES[importKey(value)] ?? null;
}

/** 4.3 item 1: at most 200 KB of valid UTF-8 (a byte order mark is accepted). */
export function decodeImportFile(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: "too_big" | "not_utf8" } {
  if (bytes.byteLength > MAX_IMPORT_BYTES) return { ok: false, error: "too_big" };
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: "not_utf8" };
  }
}

/** 4.3 item 1: the header with exactly the four columns, then from 1 to 500 lines; values trimmed. */
export function readImportFile(bytes: Uint8Array): ImportFileResult {
  const decoded = decodeImportFile(bytes);
  if (!decoded.ok) return decoded;
  const parsed = parseCsv(decoded.text);
  if (!parsed.ok) return { ok: false, error: parsed.error, line: parsed.line };
  const [header, ...records] = parsed.records;
  if (!header) return { ok: false, error: "no_header" };

  const positions = new Map<ImportColumn, number>();
  for (const [index, name] of header.fields.entries()) {
    const column = COLUMN_ALIASES[importKey(name)];
    if (!column) return { ok: false, error: "unknown_column", line: header.line };
    if (positions.has(column)) return { ok: false, error: "repeated_column", line: header.line };
    positions.set(column, index);
  }
  if (IMPORT_COLUMNS.some((column) => !positions.has(column))) return { ok: false, error: "missing_column", line: header.line };
  if (records.length === 0) return { ok: false, error: "no_rows" };
  if (records.length > MAX_IMPORT_ROWS) return { ok: false, error: "too_many_rows" };

  return {
    ok: true,
    rows: records.map((record) => ({
      line: record.line,
      fieldCountMismatch: record.fields.length !== header.fields.length,
      values: Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, (record.fields[positions.get(column)!] ?? "").trim()])) as Record<ImportColumn, string>,
    })),
  };
}

/** What the database says at the moment of the preview or the application. */
export interface ImportFacts {
  /** E-mails already in use, in lower case. */
  existingEmails: ReadonlySet<string>;
  /** Active sectors (an inactive one counts as not found). */
  activeSectors: ReadonlyArray<{ id: string; name: string }>;
}

export interface ImportPerson {
  name: string;
  email: string;
  role: ImportRole;
  sectorId: string | null;
}

export type ImportLineOutcome =
  | { line: number; values: Record<ImportColumn, string>; outcome: "create"; person: ImportPerson }
  | { line: number; values: Record<ImportColumn, string>; outcome: "skip"; reason: "email_exists" }
  | { line: number; values: Record<ImportColumn, string>; outcome: "error"; errors: ImportLineError[] };

/**
 * 4.3 item 2: each line's outcome. Every error of a line is listed. An e-mail already in use is skipped; an e-mail
 * repeated in the file is valid the first time and an error after.
 */
export function classifyImportRows(rows: readonly ImportRow[], facts: ImportFacts): ImportLineOutcome[] {
  const sectors = new Map(facts.activeSectors.map((sector) => [importKey(sector.name), sector]));
  const seen = new Set<string>();

  return rows.map((row) => {
    const { values } = row;
    const errors: ImportLineError[] = [];
    if (row.fieldCountMismatch) errors.push("field_count");

    if (values.nome === "") errors.push("name_missing");
    else if (values.nome.length > MAX_IMPORT_NAME_LENGTH) errors.push("name_too_long");

    const email = emailSchema.safeParse(values.email);
    const emailKey = email.success ? email.data : null;
    if (emailKey === null) errors.push("email_invalid");

    const role = parseImportRole(values.perfil);
    if (role === null) errors.push("role_invalid");

    let sectorId: string | null = null;
    const needsSector = role === "ATTENDANT" || role === "MANAGER";
    if (values.setor === "") {
      if (needsSector) errors.push("sector_required");
    } else if (role !== null && !needsSector) {
      errors.push("sector_not_allowed");
    } else {
      const sector = sectors.get(importKey(values.setor));
      if (sector) sectorId = sector.id;
      else errors.push("sector_unknown");
    }

    if (emailKey !== null) {
      if (seen.has(emailKey)) errors.push("email_repeated");
      seen.add(emailKey);
    }

    if (errors.length > 0) return { line: row.line, values, outcome: "error", errors };
    if (facts.existingEmails.has(emailKey!)) return { line: row.line, values, outcome: "skip", reason: "email_exists" };
    return { line: row.line, values, outcome: "create", person: { name: values.nome, email: emailKey!, role: role!, sectorId } };
  });
}

export interface ImportSummary {
  create: number;
  skip: number;
  error: number;
}

export function summarizeImport(lines: readonly ImportLineOutcome[]): ImportSummary {
  return {
    create: lines.filter(({ outcome }) => outcome === "create").length,
    skip: lines.filter(({ outcome }) => outcome === "skip").length,
    error: lines.filter(({ outcome }) => outcome === "error").length,
  };
}

/** Texts for the screens and the error report. */
export const IMPORT_FILE_ERROR_LABELS: Record<ImportFileError, string> = {
  too_big: "O arquivo passa de 200 KB.",
  not_utf8: "O arquivo não está em UTF-8.",
  unterminated_quote: "Há uma aspa sem fechamento.",
  no_header: "O arquivo está vazio: falta o cabeçalho.",
  missing_column: "O cabeçalho precisa das colunas nome, email, perfil e setor.",
  repeated_column: "O cabeçalho repete uma coluna.",
  unknown_column: "O cabeçalho tem uma coluna que não é nome, email, perfil ou setor.",
  no_rows: "O arquivo não tem nenhuma linha de pessoa.",
  too_many_rows: `O arquivo passa de ${MAX_IMPORT_ROWS} linhas de pessoas.`,
};

export const IMPORT_LINE_ERROR_LABELS: Record<ImportLineError, string> = {
  field_count: "número de campos diferente do cabeçalho",
  name_missing: "nome vazio",
  name_too_long: `nome com mais de ${MAX_IMPORT_NAME_LENGTH} caracteres`,
  email_invalid: "e-mail inválido",
  email_repeated: "e-mail repetido no arquivo",
  role_invalid: "perfil desconhecido",
  sector_required: "setor obrigatório para atendente e gestor",
  sector_not_allowed: "solicitante e administrador não têm setor",
  sector_unknown: "setor não encontrado entre os ativos",
};
