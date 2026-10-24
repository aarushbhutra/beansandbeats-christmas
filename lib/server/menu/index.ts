import type { MenuChange, MenuItem, MenuResponse } from "../../client/contracts";

export class HandlerError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export interface StaffPrincipal { id: string; role: "barista" | "booth-lead" }
export interface MenuRepository {
  read(includeInactive: boolean): Promise<MenuResponse>;
  /** Atomic compare-and-swap in Person 1's database, with revision increment. */
  update(id: string, expectedRevision: number, change: MenuChange, actorId: string): Promise<MenuItem | null>;
}
export interface MenuDependencies {
  /** Must verify the server session; null means anonymous. Never trust a client role/header. */
  authenticate(request: Request): Promise<StaffPrincipal | null>;
  repository: MenuRepository;
}
export function requireLead(actor: StaffPrincipal | null): StaffPrincipal {
  if (!actor) throw new HandlerError(401, "UNAUTHENTICATED", "Sign in with a booth-lead account.");
  if (actor.role !== "booth-lead") throw new HandlerError(403, "FORBIDDEN", "Only booth leads can access this action.");
  return actor;
}
export function apiError(error: unknown): Response {
  const known = error instanceof HandlerError;
  return Response.json({ error: { code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "Unable to complete this request." } }, { status: known ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw new HandlerError(400, "INVALID_INPUT", `${field} must contain 1–80 visible characters.`);
  return value.trim();
}
function choices(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) throw new HandlerError(400, "INVALID_INPUT", `${field} needs 1–12 options.`);
  const result = value.map(v => text(v, field));
  if (new Set(result.map(v => v.toLowerCase())).size !== result.length) throw new HandlerError(400, "INVALID_INPUT", `${field} contains duplicate options.`);
  return result;
}
export function validateMenuChange(value: unknown): MenuChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HandlerError(400, "INVALID_INPUT", "A menu change is required.");
  const v = value as Record<string, unknown>;
  const allowed = ["name", "priceCents", "allowedMilk", "allowedTemperatures", "soldOut", "active"];
  if (Object.keys(v).some(key => !allowed.includes(key))) throw new HandlerError(400, "INVALID_INPUT", "Unexpected menu fields.");
  if (!Number.isSafeInteger(v.priceCents) || (v.priceCents as number) < 0 || (v.priceCents as number) > 100000) throw new HandlerError(400, "INVALID_INPUT", "Price must be whole cents between $0 and $1,000.");
  if (typeof v.soldOut !== "boolean" || typeof v.active !== "boolean") throw new HandlerError(400, "INVALID_INPUT", "Active and sold-out values must be boolean.");
  return { name: text(v.name, "Name"), priceCents: v.priceCents as number, allowedMilk: choices(v.allowedMilk, "Milk"), allowedTemperatures: choices(v.allowedTemperatures, "Temperature"), soldOut: v.soldOut, active: v.active };
}
export function createMenuHandlers(deps: MenuDependencies) {
  return {
    get: async (request: Request): Promise<Response> => {
      try {
        const actor = await deps.authenticate(request);
        const menu = await deps.repository.read(actor?.role === "booth-lead");
        // Defense in depth if a repository accidentally returns inactive entries to a public request.
        return Response.json({ ...menu, items: actor?.role === "booth-lead" ? menu.items : menu.items.filter(item => item.active) }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } });
      } catch (error) { return apiError(error); }
    },
    patch: async (request: Request, id: string): Promise<Response> => {
      try {
        const actor = requireLead(await deps.authenticate(request));
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HandlerError(400, "INVALID_INPUT", "Invalid menu item ID.");
        let body;
        try { body = await request.json(); } catch { throw new HandlerError(400, "INVALID_INPUT", "Expected a JSON menu update."); }
        if (!body || typeof body !== "object" || Object.keys(body).some(key => !["expectedRevision", "change"].includes(key)) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new HandlerError(400, "INVALID_INPUT", "A valid expectedRevision and change are required.");
        const change = validateMenuChange(body.change);
        const item = await deps.repository.update(id, body.expectedRevision, change, actor.id);
        if (!item) throw new HandlerError(409, "REVISION_CONFLICT", "This item changed on another device. Refresh and review it before saving again.");
        return Response.json({ item }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) { return apiError(error); }
    },
  };
}
