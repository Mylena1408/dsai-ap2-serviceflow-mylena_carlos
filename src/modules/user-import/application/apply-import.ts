import type { AuditScope } from "@/modules/audit";
import { requireConfigurationAdministrator } from "@/server/authorization";
import { ConflictError, ValidationError } from "@/server/errors";
import { IMPORTED_PASSWORD_HASH, importReport, normalizeImportText, type ImportLineOutcome, type ImportPerson, type ImportReportEntry, type ImportSummary } from "../domain/user-import";
import { evaluateImportText, importDigest, type UserImportReader } from "./preview-import";

// Applying an import (SPEC 2026-11-09-comunicacao-e-calendarios, 4.1 item 3 and 4.3 items 3 and 4; decision K1;
// SF-243): only the administrator; the previewed text is evaluated again with the database of the moment, in one
// serializable transaction; each valid line becomes an inactive person with an unusable password, audited as the
// screen does; the import is recorded with its counts and the report of the lines left out, and audited too.

export interface UserImportConfirmation {
  content: string;
  digest: string;
}

export interface UserImportTransaction extends AuditScope, UserImportReader {
  createUser(person: ImportPerson & { passwordHash: string; isActive: false }): Promise<{ id: string }>;
  recordImport(record: { actorId: string; createdCount: number; skippedCount: number; errorCount: number; report: ImportReportEntry[] }): Promise<{ id: string }>;
}

export interface UserImportStore {
  run<T>(work: (transaction: UserImportTransaction) => Promise<T>): Promise<T>;
}

export interface UserImportResult {
  importId: string;
  summary: ImportSummary;
  /** Each line as evaluated at the application, which may differ from the preview (4.3 item 4). */
  lines: ImportLineOutcome[];
}

export async function applyUserImport(confirmation: UserImportConfirmation, store: UserImportStore): Promise<UserImportResult> {
  const actor = await requireConfigurationAdministrator();
  // A form sends the text back with CRLF; the digest is of the previewed text, with LF.
  const content = normalizeImportText(typeof confirmation.content === "string" ? confirmation.content : "");
  if (importDigest(content) !== confirmation.digest) throw new ConflictError();

  return store.run(async (transaction) => {
    const evaluation = await evaluateImportText(content, transaction);
    // Only when the 200 KB or the format were tampered with: the previewed text passed.
    if (!evaluation.ok) throw new ValidationError([{ path: [], code: "custom" }]);

    for (const line of evaluation.lines) {
      if (line.outcome !== "create") continue;
      await transaction.audited({ actor, action: "CREATED", entityType: "USER" }, () =>
        transaction.createUser({ ...line.person, passwordHash: IMPORTED_PASSWORD_HASH, isActive: false }),
      );
    }

    const record = await transaction.audited({ actor, action: "IMPORTED", entityType: "USER_IMPORT" }, () =>
      transaction.recordImport({
        actorId: actor.id,
        createdCount: evaluation.summary.create,
        skippedCount: evaluation.summary.skip,
        errorCount: evaluation.summary.error,
        report: importReport(evaluation.lines),
      }),
    );
    return { importId: record.id, summary: evaluation.summary, lines: evaluation.lines };
  });
}
