import "server-only";
import { requireStaff } from "../auth";
import { HandlerError, type StaffPrincipal } from ".";

/** Adapter around Person 1's verifier; no new session or credential store. */
export async function authenticateSharedStaff(request: Request): Promise<StaffPrincipal | null> {
  if (!request.headers.has("Authorization")) return null;
  const result = await requireStaff(request);
  if (!result.ok) throw new HandlerError(result.status, result.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", "A valid staff session with the required role is needed.");
  return { id: result.userId, role: result.role };
}
