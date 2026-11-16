import { z } from "zod";
import { getAnnouncementsInForce } from "@/modules/announcements";
import type { ApiUser } from "@/modules/api-tokens";
import { getSectorCalendarView } from "@/modules/calendar";
import { getRequestChecklist } from "@/modules/checklists";
import { addComment, listComments } from "@/modules/comments";
import { listPublishedServiceRequirements } from "@/modules/document-requirements";
import {
  assumeRequest,
  cancelRequest,
  createRequest,
  effectiveAssigneeId,
  getAttendantRequest,
  getManagerRequest,
  getRequesterRequest,
  listRequestLinks,
  getRequestGroupBlock,
  pageManagerApprovals,
  listSectorDestinations,
  listTransferCandidates,
  pauseRequestSla,
  resumeRequestSla,
  sendRequestToSector,
  releaseRequest,
  reopenRequest,
  transferRequest,
  transitionRequestStatus,
  listRequestAttachments,
  listRequestFieldAnswers,
  searchAttendantQueue,
  searchRequesterRequests,
  slaSituation,
  type RequestWithHistory,
} from "@/modules/requests";
import { listPublishedServiceFields } from "@/modules/service-fields";
import { listPublishedServices } from "@/modules/services";
import { getRequestTags } from "@/modules/tags";
import { getRequestTime } from "@/modules/time-entries";
import { actorHasPermission } from "@/server/authorization";
import { NotFoundError, ValidationError } from "@/server/errors";
import { validateInput } from "@/server/validation";
import { PERMISSIONS } from "@/shared/permissions";
import type { ApiErrorCode } from "../domain/errors";
import {
  announcementRepresentation,
  commentRepresentation,
  sectorCalendarRepresentation,
  requestDetailRepresentation,
  requestSummaryRepresentation,
  serviceRepresentation,
  type ApiPage,
  type ApiRequestContext,
  type ApiTeamView,
} from "../domain/representation";

// What each /api/v1 route does (SPEC 2026-11-02-api-externa-webhooks, 5.4; decision A4). Every
// operation calls the use cases of the screens, inside the call context where the token owner is
// the signed-in user, so the same profile, sector and permission rules apply.

/** A refusal that is not an application error: profile without the route, or required documents. */
export class ApiRefusal extends Error {
  constructor(readonly code: ApiErrorCode) {
    super(code);
  }
}

export interface ApiCaller {
  user: ApiUser;
  scope: "READ" | "WRITE";
  expiresAt: Date;
  sectorName: string | null;
}

export interface ApiResult {
  status: number;
  body: unknown;
  /** True when the call recorded events, so the outbox is processed right after the answer. */
  recordedEvents?: boolean;
}

export type RawQuery = Record<string, string | string[] | undefined>;

const MANAGER_FILTERS = ["pending", "all", "sector"] as const;

function requireRole(caller: ApiCaller, ...roles: ApiUser["role"][]): void {
  if (!roles.includes(caller.user.role)) throw new ApiRefusal("forbidden");
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function context(request: RequestWithHistory, now: Date): ApiRequestContext {
  const assigneeId = effectiveAssigneeId(request);
  return {
    assignee: assigneeId && request.assignee ? { id: request.assignee.id, name: request.assignee.name } : null,
    slaSituation: slaSituation(request, now),
  };
}

export async function me(caller: ApiCaller): Promise<ApiResult> {
  const { user } = caller;
  const permissions = [];
  for (const permission of PERMISSIONS) {
    if (await actorHasPermission(user, permission)) permissions.push(permission);
  }

  return {
    status: 200,
    body: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sector: user.sectorId ? { id: user.sectorId, name: caller.sectorName } : null,
      permissions,
      token: { scope: caller.scope, expiresAt: caller.expiresAt.toISOString() },
    },
  };
}

/**
 * SPEC 2026-11-09-comunicacao-e-calendarios, 7 item 2 (SF-258): the announcements in force for the token owner, as
 * the strip's rules choose them (audience and period, without the screen's limit of three); every profile.
 */
export async function announcements(): Promise<ApiResult> {
  const items = await getAnnouncementsInForce();
  return { status: 200, body: { items: items.map(announcementRepresentation) } };
}

/**
 * 7 item 2 and CA-COM-02: a sector's effective calendar, only to who already reads it on the screens (a manager, their
 * own sector; the tokens' profiles have no administrator). Another sector, or one that does not exist, is "not found".
 */
export async function sectorCalendar(caller: ApiCaller, rawSectorId: string): Promise<ApiResult> {
  requireRole(caller, "MANAGER");
  const sectorId = validateInput(z.string().uuid(), rawSectorId);
  const view = await getSectorCalendarView(sectorId);
  if (!view.sector || view.sector.id !== sectorId) throw new NotFoundError();
  return { status: 200, body: sectorCalendarRepresentation({ ...view, sector: view.sector }) };
}

export async function services(caller: ApiCaller): Promise<ApiResult> {
  requireRole(caller, "REQUESTER");
  const published = await listPublishedServices();
  const items = [];

  for (const service of published) {
    const [requirements, fields] = await Promise.all([
      listPublishedServiceRequirements(service.id),
      listPublishedServiceFields(service.id),
    ]);
    items.push(serviceRepresentation(service, requirements, fields));
  }

  return { status: 200, body: { items } };
}

/** The page asked for in the manager's list; anything but a whole number from 1 is refused, as before. */
function managerPageNumber(rawPage: string | undefined): number {
  const page = rawPage === undefined ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1) {
    throw new ValidationError([{ path: ["search"], code: "invalid_value" }]);
  }
  return page;
}

/** "Minhas solicitações", the sector queue or "Aprovações", with the filters of each screen. */
export async function listRequests(caller: ApiCaller, query: RawQuery, now: Date): Promise<ApiResult> {
  requireRole(caller, "REQUESTER", "ATTENDANT", "MANAGER");
  let page: { items: RequestWithHistory[]; page: number; pageCount: number; total: number };

  if (caller.user.role === "MANAGER") {
    const filter = single(query.filter) ?? "pending";
    if (!MANAGER_FILTERS.includes(filter as (typeof MANAGER_FILTERS)[number])) {
      throw new ValidationError([{ path: ["search"], code: "invalid_value" }]);
    }
    // SPEC 2026-11-16-paginacao-aprovacoes, 2 item 3: the same page as the screen, read from the database.
    page = await pageManagerApprovals(filter, managerPageNumber(single(query.page)));
  } else {
    page = caller.user.role === "REQUESTER" ? await searchRequesterRequests(query) : await searchAttendantQueue(query);
  }

  const body: ApiPage<ReturnType<typeof requestSummaryRepresentation>> = {
    items: page.items.map((request) => requestSummaryRepresentation(request, context(request, now))),
    page: page.page,
    pageCount: page.pageCount,
    total: page.total,
  };
  return { status: 200, body };
}

/**
 * The blocks only the team of the request's sector reads (SPEC 2026-11-08-atendimento-dia-a-dia, 9.1 item 2):
 * read by the screens' use cases, which tell anyone else the request does not exist. The request was already
 * read, so that answer becomes null here; the requester never reads them (decisions I2, I6 and I9).
 */
async function loadTeamView(caller: ApiCaller, requestId: string): Promise<ApiTeamView | null> {
  if (caller.user.role === "REQUESTER") return null;
  try {
    const [tags, checklist, time] = await Promise.all([getRequestTags(requestId), getRequestChecklist(requestId), getRequestTime(requestId)]);
    return { tags, checklist, time };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

async function loadDetail(caller: ApiCaller, requestId: string, now: Date) {
  const request =
    caller.user.role === "REQUESTER"
      ? await getRequesterRequest(requestId)
      : caller.user.role === "ATTENDANT"
        ? await getAttendantRequest(requestId)
        : await getManagerRequest(requestId);
  const [answers, attachments, comments, links, group, team] = await Promise.all([
    listRequestFieldAnswers(request.id),
    listRequestAttachments(request.id),
    // The manager screen has no conversation (SPEC 2026-10-31-comentarios, 5.1).
    caller.user.role === "MANAGER" ? Promise.resolve([]) : listComments(request.id),
    // SPEC 2026-11-07-operacao-e-automacao, 3.3 item 1: filtered as on the screens.
    listRequestLinks(request.id),
    // 3.3 item 4: the bundle and its other requests.
    getRequestGroupBlock(request.id),
    loadTeamView(caller, request.id),
  ]);
  return requestDetailRepresentation(request, context(request, now), { answers, attachments, comments, links: links.links, group, team });
}

export async function getRequest(caller: ApiCaller, requestId: string, now: Date): Promise<ApiResult> {
  requireRole(caller, "REQUESTER", "ATTENDANT", "MANAGER");
  return { status: 200, body: await loadDetail(caller, requestId, now) };
}

const openingSchema = z
  .object({
    serviceId: z.string(),
    description: z.string(),
    // A multiple choice takes a list (SPEC 2026-11-03-campos-condicionais-atendimento, 5.8.1).
    fieldValues: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  })
  .strict();

/** Opening without attachments (section 4): a service with a required document is refused. */
export async function openRequest(caller: ApiCaller, body: unknown, now: Date): Promise<ApiResult> {
  requireRole(caller, "REQUESTER");
  const input = validateInput(openingSchema, body);
  const requirements = await listPublishedServiceRequirements(input.serviceId);
  if (requirements.some((requirement) => requirement.isRequired)) {
    throw new ApiRefusal("documents_required");
  }

  const created = await createRequest({
    serviceId: input.serviceId,
    description: input.description,
    attachments: [],
    ...(input.fieldValues ? { fieldValues: input.fieldValues } : {}),
  });

  return { status: 201, body: await loadDetail(caller, created.id, now), recordedEvents: true };
}

const commentSchema = z.object({ body: z.string(), internal: z.boolean().optional() }).strict();

/** Same rules as the conversation on the screen; internal notes only for attendants. */
export async function commentOnRequest(caller: ApiCaller, requestId: string, body: unknown): Promise<ApiResult> {
  requireRole(caller, "REQUESTER", "ATTENDANT", "MANAGER");
  const input = validateInput(commentSchema, body);
  const comment = await addComment({ requestId, body: input.body, isInternal: input.internal ?? false });
  return { status: 201, body: commentRepresentation(comment), recordedEvents: true };
}

// Actions of the attendance (SPEC 2026-11-03-api-acoes-webhooks-setor, 5.1; decision W1). Each one
// calls the use case of the screen, which checks sector, assignee, supervision and state; the
// answer is the updated detail.

export type RequestAction =
  | "start"
  | "complete"
  | "assume"
  | "release"
  | "transfer"
  | "cancel"
  | "reopen"
  // SPEC 2026-11-03-pausa-sla-calendario, 5.8.
  | "pause-sla"
  | "resume-sla";

const emptySchema = z.object({}).strict();
const transferSchema = z.object({ assigneeId: z.string() }).strict();
const noteSchema = z.object({ note: z.string().optional() }).strict();
const requiredNoteSchema = z.object({ note: z.string() }).strict();
const reasonSchema = z.object({ reason: z.string() }).strict();

export async function runRequestAction(
  caller: ApiCaller,
  requestId: string,
  action: RequestAction,
  body: unknown,
  now: Date,
): Promise<ApiResult> {
  requireRole(caller, "REQUESTER", "ATTENDANT", "MANAGER");

  switch (action) {
    case "start":
    case "complete":
      validateInput(emptySchema, body);
      await transitionRequestStatus({ requestId, toStatus: action === "start" ? "IN_PROGRESS" : "COMPLETED" });
      break;
    case "assume":
      validateInput(emptySchema, body);
      await assumeRequest({ requestId });
      break;
    case "release":
      validateInput(emptySchema, body);
      await releaseRequest({ requestId });
      break;
    case "transfer":
      await transferRequest({ requestId, assigneeId: validateInput(transferSchema, body).assigneeId });
      break;
    case "cancel":
      await cancelRequest({ requestId, ...validateInput(noteSchema, body) });
      break;
    case "reopen":
      await reopenRequest({ requestId, note: validateInput(requiredNoteSchema, body).note });
      break;
    case "pause-sla":
      await pauseRequestSla({ requestId, reason: validateInput(reasonSchema, body).reason });
      break;
    case "resume-sla":
      validateInput(emptySchema, body);
      await resumeRequestSla({ requestId });
      break;
  }

  return { status: 200, body: await loadDetail(caller, requestId, now), recordedEvents: true };
}

// SPEC 2026-11-03-transferencia-entre-setores, 5.8. The caller stops reading the request once it
// leaves the sector, so the answer confirms the move instead of returning the detail.
const sectorTransferSchema = z.object({ sectorId: z.string(), note: z.string().optional() }).strict();

export async function sendToSector(caller: ApiCaller, requestId: string, body: unknown): Promise<ApiResult> {
  requireRole(caller, "REQUESTER", "ATTENDANT", "MANAGER");
  const { sectorId, note } = validateInput(sectorTransferSchema, body);
  await sendRequestToSector({ requestId, sectorId, note });
  return { status: 200, body: { id: requestId, sectorId }, recordedEvents: true };
}

/** Sectors that may receive the request (5.2), for attendants of its sector, as on the screen. */
export async function sectorCandidates(caller: ApiCaller, requestId: string): Promise<ApiResult> {
  requireRole(caller, "ATTENDANT");
  const sectors = await listSectorDestinations(requestId);
  return { status: 200, body: { items: sectors.map(({ id, name }) => ({ id, name })) } };
}

/** Who may receive a transfer (5.1): active attendants of the sector, as on the screen. */
export async function transferCandidates(caller: ApiCaller, requestId: string): Promise<ApiResult> {
  requireRole(caller, "ATTENDANT");
  const candidates = await listTransferCandidates(requestId);
  return { status: 200, body: { items: candidates.map(({ id, name }) => ({ id, name })) } };
}
