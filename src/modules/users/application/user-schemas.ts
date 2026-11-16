import { z } from "zod";
import { emailSchema, entityIdSchema, nameSchema } from "@/shared/validation";
import { DEFAULT_REQUESTER_KIND, REQUESTER_KINDS, type RequesterKind } from "@/shared/requester-kinds";

const userRoleSchema = z.enum(["ADMIN", "REQUESTER", "ATTENDANT", "MANAGER"]);

// Attendants and managers belong to one sector (SPEC 2026-11-01-aprovacoes, 5.1).
export function roleRequiresSector(role: z.infer<typeof userRoleSchema>): boolean {
  return role === "ATTENDANT" || role === "MANAGER";
}
const sectorAssignmentSchema = entityIdSchema.nullable().optional();
// SPEC 2026-11-16-tipos-de-solicitante, 4.1 item 1 and rule 3: only a requester has a kind; empty means a student
// (decision T4).
const requesterKindSchema = z.enum(REQUESTER_KINDS).nullable().optional();

function validateUserRoleSector(
  user: { role: z.infer<typeof userRoleSchema>; sectorId?: string | null; requesterKind?: RequesterKind | null },
  context: z.RefinementCtx,
): void {
  if (user.role !== "REQUESTER" && user.requesterKind !== undefined && user.requesterKind !== null) {
    context.addIssue({
      code: "custom",
      path: ["requesterKind"],
      message: "Only requesters have a kind.",
    });
  }

  const hasSector = user.sectorId !== undefined && user.sectorId !== null;

  if (roleRequiresSector(user.role) && !hasSector) {
    context.addIssue({
      code: "custom",
      path: ["sectorId"],
      message: "Attendants and managers require a sector.",
    });
  }

  if (!roleRequiresSector(user.role) && hasSector) {
    context.addIssue({
      code: "custom",
      path: ["sectorId"],
      message: "Only attendants and managers may be associated with a sector.",
    });
  }
}

/** The kind kept for a person: a requester's, or the default; none for the other roles. */
export function requesterKindOf(role: z.infer<typeof userRoleSchema>, kind: RequesterKind | null | undefined): RequesterKind | null {
  return role === "REQUESTER" ? (kind ?? DEFAULT_REQUESTER_KIND) : null;
}

// The role and sector alone; the requester's kind is in the creation and update schemas below.
export const userProfileInputSchema = z
  .object({
    role: userRoleSchema,
    sectorId: sectorAssignmentSchema,
  })
  .strict()
  .superRefine(validateUserRoleSector)
  .transform((user) => ({
    ...user,
    sectorId: user.sectorId ?? null,
  }));

export const userCreationInputSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: z.string().min(1),
    role: userRoleSchema,
    sectorId: sectorAssignmentSchema,
    requesterKind: requesterKindSchema,
  })
  .strict()
  .superRefine(validateUserRoleSector)
  .transform((user) => ({
    ...user,
    sectorId: user.sectorId ?? null,
    requesterKind: requesterKindOf(user.role, user.requesterKind),
  }));

export const userUpdateInputSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: z.string().min(1).optional(),
    role: userRoleSchema,
    sectorId: sectorAssignmentSchema,
    requesterKind: requesterKindSchema,
  })
  .strict()
  .superRefine(validateUserRoleSector)
  .transform((user) => ({
    ...user,
    sectorId: user.sectorId ?? null,
    requesterKind: requesterKindOf(user.role, user.requesterKind),
  }));

export type UserProfileInput = z.output<typeof userProfileInputSchema>;
export type UserCreationInput = z.output<typeof userCreationInputSchema>;
export type UserUpdateInput = z.output<typeof userUpdateInputSchema>;
