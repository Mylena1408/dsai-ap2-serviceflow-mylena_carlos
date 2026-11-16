import { OFFERED_TO_LABELS, REQUESTER_KINDS, REQUESTER_KIND_LABELS, type RequesterKind } from "@/shared/requester-kinds";

// The requester's kind and the service's "Oferecido a" in the administration's forms (SPEC
// 2026-11-16-tipos-de-solicitante, 4.1 items 1 and 3; SPEC 2026-11-16-professores-e-tecnicos, P1 and P2).

/** Internal kinds are the institution's people; the general public is external (decision T3). */
const KIND_NOTES: Record<RequesterKind, string> = {
  STUDENT: "interno",
  PROFESSOR: "interno",
  TECHNICIAN: "interno",
  PUBLIC: "externo",
};

export function RequesterKindSelect({ defaultValue }: { defaultValue?: RequesterKind | null }) {
  return (
    <label>
      Tipo de solicitante
      <select defaultValue={defaultValue ?? "STUDENT"} name="requesterKind">
        {REQUESTER_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {REQUESTER_KIND_LABELS[kind]} ({KIND_NOTES[kind]})
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * One box per kind; at least one must stay checked (rule 4.2.2, checked by the server). The hidden marker tells the
 * action the form has the list, so unchecking every box is refused instead of keeping the current value.
 */
export function OfferedToFieldset({ defaultValue }: { defaultValue?: readonly RequesterKind[] }) {
  const checked = new Set(defaultValue ?? REQUESTER_KINDS);
  return (
    <fieldset className="offered-to">
      <legend>Oferecido a</legend>
      <input name="offeredToField" type="hidden" value="1" />
      {REQUESTER_KINDS.map((kind) => (
        <label key={kind}>
          <input defaultChecked={checked.has(kind)} name="offeredTo" type="checkbox" value={kind} />
          {OFFERED_TO_LABELS[kind]}
        </label>
      ))}
    </fieldset>
  );
}

/** The action's side: the checked kinds when the form has the list; nothing (keep the current value) otherwise. */
export function offeredToFromForm(formData: FormData): { offeredTo: string[] } | Record<string, never> {
  return formData.has("offeredToField") ? { offeredTo: formData.getAll("offeredTo").map(String) } : {};
}
