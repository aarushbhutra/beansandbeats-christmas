import "server-only";
import type { Role, StaffProfile } from "@/lib/domain/types";
import { getDb, type Database, type Queryable } from "./db";
import { HttpError, clientIp, isSecureRequest, readCookie } from "./http";
import { DUMMY_HASH, randomToken, sha256, verifyPassword } from "./passwords";

export const SESSION_COOKIE = "bb_session";
const SESSION_HOURS = 16; // one long event shift
const WINDOW_MINUTES = 10;
const MAX_FAILURES = 8;

export interface Principal extends StaffProfile { sessionId: string; expiresAt: string }

type StaffRow = { id: string; username: string; display_name: string; role: Role; password_hash: string; active: boolean };

function profile(row: Pick<StaffRow, "id" | "username" | "display_name" | "role">): StaffProfile {
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role };
}

export async function login(db: Database, input: { username: string; password: string; ip: string }) {
  const username = input.username.trim().toLowerCase();
  const keys = [`u:${username}`, `ip:${sha256(input.ip).slice(0, 16)}`];
  const [{ failures }] = await db.query<{ failures: number }>(
    `select coalesce(max(n), 0)::int as failures from (
       select count(*) as n from bb.login_attempts
       where key = any(array(select jsonb_array_elements_text($1::text::jsonb))) and not success and at > now() - make_interval(mins => $2::int)
       group by key) per_key`,
    [JSON.stringify(keys), WINDOW_MINUTES],
  );
  if (failures >= MAX_FAILURES) throw new HttpError(429, "TOO_MANY_ATTEMPTS", `Too many attempts. Wait ${WINDOW_MINUTES} minutes or ask a booth lead.`);

  const [row] = await db.query<StaffRow>("select id, username, display_name, role, password_hash, active from bb.staff where username = $1", [username]);
  const valid = await verifyPassword(input.password.trim(), row?.password_hash ?? DUMMY_HASH);
  const success = Boolean(row && row.active && valid);
  for (const key of keys) await db.query("insert into bb.login_attempts(key, success) values ($1, $2)", [key, success]);
  if (!success) throw new HttpError(401, "INVALID_LOGIN", "That username and password don't match an active staff account.");

  const token = randomToken();
  const [session] = await db.query<{ id: string; expires_at: Date }>(
    `insert into bb.sessions(token_hash, staff_id, expires_at) values ($1, $2, now() + make_interval(hours => $3::int)) returning id, expires_at`,
    [sha256(token), row.id, SESSION_HOURS],
  );
  await audit(db, row.id, "auth.login", row.username);
  return { token, staff: profile(row), expiresAt: new Date(session.expires_at).toISOString() };
}

export async function principalFromRequest(db: Queryable, request: Request): Promise<Principal | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const [row] = await db.query<StaffRow & { session_id: string; expires_at: Date; last_seen_at: Date }>(
    `select s.id as session_id, s.expires_at, s.last_seen_at, st.id, st.username, st.display_name, st.role, st.active
     from bb.sessions s join bb.staff st on st.id = s.staff_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and st.active`,
    [sha256(token)],
  );
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db.query("update bb.sessions set last_seen_at = now() where id = $1", [row.session_id]);
  }
  return { ...profile(row), sessionId: row.session_id, expiresAt: new Date(row.expires_at).toISOString() };
}

/** Resolves the database and a verified staff principal, or throws 401/403. */
export async function requireStaff(request: Request, roles: Role[] = ["barista", "lead"]): Promise<{ db: Database; staff: Principal }> {
  const db = await getDb();
  const staff = await principalFromRequest(db, request);
  if (!staff) throw new HttpError(401, "AUTH_REQUIRED", "Sign in with a staff account.");
  if (!roles.includes(staff.role)) throw new HttpError(403, "FORBIDDEN", roles.includes("lead") && roles.length === 1 ? "Booth leads only." : "Your role can't do that.");
  return { db, staff };
}

export async function logout(db: Database, request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await db.query("update bb.sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [sha256(token)]);
}

export function sessionCookie(request: Request, token: string, expiresAt: string): string {
  return [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Expires=${new Date(expiresAt).toUTCString()}`, ...(isSecureRequest(request) ? ["Secure"] : [])].join("; ");
}

export function clearSessionCookie(request: Request): string {
  return [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0", ...(isSecureRequest(request) ? ["Secure"] : [])].join("; ");
}

export async function audit(db: Queryable, actorId: string | null, action: string, target: string | null, detail?: unknown): Promise<void> {
  await db.query("insert into bb.audit_log(actor_id, action, target, detail) values ($1, $2, $3, $4::text::jsonb)", [actorId, action, target, detail === undefined ? null : JSON.stringify(detail)]);
}

export { clientIp };
