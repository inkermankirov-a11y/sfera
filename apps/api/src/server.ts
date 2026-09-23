import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { initDatabase, pool } from "./db.js";

const app = Fastify({ logger: true });

const PORT = Number(process.env.PORT ?? 8787);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "https://inkermankirov-a11y.github.io";
const WEB_RETURN_URL = process.env.WEB_RETURN_URL ?? "https://inkermankirov-a11y.github.io/sfera/";
const API_PUBLIC_URL = process.env.API_PUBLIC_URL ?? "";
const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID ?? "";
const YANDEX_CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET ?? "";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "sfera_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const base64url = (value: Buffer) => value.toString("base64url");

function requireConfig() {
  const missing = [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["API_PUBLIC_URL", API_PUBLIC_URL],
    ["YANDEX_CLIENT_ID", YANDEX_CLIENT_ID],
    ["YANDEX_CLIENT_SECRET", YANDEX_CLIENT_SECRET]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60
  };
}

async function createSession(userId: string) {
  const rawToken = base64url(randomBytes(32));
  const csrfToken = base64url(randomBytes(24));
  const tokenHash = sha256(rawToken);
  const csrfHash = sha256(csrfToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000);

  await pool.query(
    `insert into sessions (id, user_id, token_hash, csrf_token_hash, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, tokenHash, csrfHash, expiresAt]
  );

  return { rawToken, csrfToken };
}

async function sessionFromRequest(request: any) {
  const rawToken = request.cookies?.[SESSION_COOKIE_NAME];
  if (!rawToken) return null;

  const result = await pool.query(
    `select s.id as session_id, s.csrf_token_hash, u.id, u.yandex_id, u.display_name, u.email, u.avatar_url
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
      limit 1`,
    [sha256(rawToken)]
  );

  return result.rows[0] ?? null;
}

await app.register(cookie);
await app.register(cors, {
  origin: WEB_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token"]
});

app.get("/health", async () => ({ ok: true }));

app.get("/auth/yandex/start", async (_request, reply) => {
  requireConfig();

  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(64));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `insert into auth_flows (state_hash, code_verifier, return_to, expires_at)
     values ($1, $2, $3, $4)`,
    [sha256(state), verifier, WEB_RETURN_URL, expiresAt]
  );

  const params = new URLSearchParams({
    response_type: "code",
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: `${API_PUBLIC_URL}/auth/yandex/callback`,
    scope: "login:info login:email login:avatar",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  return reply.redirect(`https://oauth.yandex.ru/authorize?${params.toString()}`);
});

app.get("/auth/yandex/callback", async (request: any, reply) => {
  requireConfig();

  const code = String(request.query?.code ?? "");
  const state = String(request.query?.state ?? "");
  if (!code || !state) return reply.code(400).send({ error: "missing_code_or_state" });

  const flow = await pool.query(
    `delete from auth_flows
      where state_hash = $1 and expires_at > now()
      returning code_verifier, return_to`,
    [sha256(state)]
  );

  if (!flow.rowCount) return reply.code(400).send({ error: "invalid_or_expired_state" });

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: YANDEX_CLIENT_ID,
    client_secret: YANDEX_CLIENT_SECRET,
    code_verifier: flow.rows[0].code_verifier,
    redirect_uri: `${API_PUBLIC_URL}/auth/yandex/callback`
  });

  const tokenResponse = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!tokenResponse.ok) {
    app.log.error({ body: await tokenResponse.text() }, "Yandex token exchange failed");
    return reply.code(502).send({ error: "yandex_token_exchange_failed" });
  }

  const tokenData = await tokenResponse.json() as { access_token: string };

  const profileResponse = await fetch("https://login.yandex.ru/info?format=json", {
    headers: { Authorization: `OAuth ${tokenData.access_token}` }
  });

  if (!profileResponse.ok) return reply.code(502).send({ error: "yandex_profile_failed" });

  const profile = await profileResponse.json() as {
    id: string;
    display_name?: string;
    real_name?: string;
    default_email?: string;
    default_avatar_id?: string;
    is_avatar_empty?: boolean;
  };

  const userId = randomUUID();
  const avatarUrl = profile.default_avatar_id && !profile.is_avatar_empty
    ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
    : null;

  const user = await pool.query(
    `insert into users (id, yandex_id, display_name, email, avatar_url)
     values ($1, $2, $3, $4, $5)
     on conflict (yandex_id)
     do update set
       display_name = excluded.display_name,
       email = excluded.email,
       avatar_url = excluded.avatar_url,
       updated_at = now()
     returning id`,
    [userId, profile.id, profile.display_name ?? profile.real_name ?? null, profile.default_email ?? null, avatarUrl]
  );

  const session = await createSession(user.rows[0].id);

  reply.setCookie(SESSION_COOKIE_NAME, session.rawToken, cookieOptions());
  reply.setCookie("sfera_csrf", session.csrfToken, {
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60
  });

  return reply.redirect(flow.rows[0].return_to);
});

app.get("/auth/session", async (request, reply) => {
  const session = await sessionFromRequest(request);
  if (!session) return reply.code(401).send({ authenticated: false });

  return {
    authenticated: true,
    user: {
      id: session.id,
      yandexId: session.yandex_id,
      displayName: session.display_name,
      email: session.email,
      avatarUrl: session.avatar_url
    }
  };
});

app.post("/auth/logout", async (request: any, reply) => {
  const session = await sessionFromRequest(request);
  if (!session) {
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    reply.clearCookie("sfera_csrf", { path: "/" });
    return { ok: true };
  }

  const csrfHeader = String(request.headers["x-csrf-token"] ?? "");
  const csrfCookie = String(request.cookies?.sfera_csrf ?? "");
  if (!csrfHeader || csrfHeader !== csrfCookie || sha256(csrfHeader) !== session.csrf_token_hash) {
    return reply.code(403).send({ error: "csrf_failed" });
  }

  await pool.query("update sessions set revoked_at = now() where id = $1", [session.session_id]);
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  reply.clearCookie("sfera_csrf", { path: "/" });
  return { ok: true };
});

await initDatabase();
await pool.query("delete from auth_flows where expires_at <= now()");
await pool.query("delete from sessions where expires_at <= now() or revoked_at is not null");

app.listen({ port: PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
