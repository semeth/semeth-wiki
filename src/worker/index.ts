import { isKnownProject, type FeedbackProjectKind, type FeedbackReportType } from '../lib/feedback';

export interface Env {
  DB: D1Database;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ADMIN_DISCORD_IDS?: string;
  PUBLIC_ORIGIN?: string;
}

const SESSION_COOKIE = 'semeth_session';
const OAUTH_COOKIE = 'semeth_oauth';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const TITLE_MAX = 120;
const BODY_MAX = 4000;
const VERSION_MAX = 32;

type SessionRow = {
  id: string;
  discord_id: string;
  expires_at: number;
  username: string;
  avatar: string | null;
};

type ReportRow = {
  id: number;
  type: FeedbackReportType;
  title: string;
  body: string;
  minecraft_version: string | null;
  mod_version: string | null;
  status: 'open' | 'closed';
  created_at: number;
  username: string;
  avatar: string | null;
  author_discord_id: string;
};

type ReplyRow = {
  id: number;
  report_id: number;
  body: string;
  created_at: number;
  username: string;
  avatar: string | null;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (method === 'GET' && path === '/api/auth/discord') {
        return startDiscord(request, env, url);
      }
      if (method === 'GET' && path === '/api/auth/discord/callback') {
        return discordCallback(request, env, url);
      }
      if (method === 'POST' && path === '/api/auth/logout') {
        return logout(request, env);
      }
      if (method === 'GET' && path === '/api/me') {
        return me(request, env);
      }
      if (method === 'GET' && path === '/api/reports') {
        return listReports(request, url, env);
      }
      if (method === 'POST' && path === '/api/reports') {
        return createReport(request, env);
      }
      const patch = path.match(/^\/api\/reports\/(\d+)$/);
      if (method === 'PATCH' && patch) {
        return updateReport(request, env, Number(patch[1]));
      }
      const reply = path.match(/^\/api\/reports\/(\d+)\/replies$/);
      if (method === 'POST' && reply) {
        return createReply(request, env, Number(reply[1]));
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: 'Something went wrong' }, 500);
    }
  },
};

function publicOrigin(request: Request, env: Env): string {
  if (env.PUBLIC_ORIGIN) {
    return env.PUBLIC_ORIGIN.replace(/\/$/, '');
  }
  const host = request.headers.get('X-Forwarded-Host') ?? request.headers.get('Host');
  const proto = request.headers.get('X-Forwarded-Proto') ?? new URL(request.url).protocol.replace(':', '');
  if (host) {
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

function redirectUri(request: Request, env: Env): string {
  return `${publicOrigin(request, env)}/api/auth/discord/callback`;
}

function isAdmin(env: Env, discordId: string): boolean {
  return (env.ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(discordId);
}

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function redirect(location: string, headers?: HeadersInit): Response {
  return new Response(null, {
    status: 302,
    headers: { location, ...headers },
  });
}

function cookieHeader(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean },
): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
  ];
  if (options.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function clearCookie(name: string, secure: boolean): string {
  return cookieHeader(name, '', { maxAge: 0, secure });
}

function isSecure(request: Request, env: Env): boolean {
  return publicOrigin(request, env).startsWith('https://');
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) {
      return rest.join('=') || null;
    }
  }
  return null;
}

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  if (!value.startsWith('/mods/') && !value.startsWith('/modpacks/')) {
    return '/';
  }
  return value;
}

function appendError(returnTo: string, code: string): string {
  const url = new URL(returnTo, 'https://semeth.wiki');
  url.searchParams.set('error', code);
  return `${url.pathname}${url.search}${url.hash}`;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function signState(secret: string, payload: { n: string; r: string; e: number }): Promise<string> {
  const body = toBase64Url(JSON.stringify(payload));
  const sig = await hmacHex(secret, body);
  return `${body}.${sig}`;
}

async function readState(
  secret: string,
  token: string | null,
): Promise<{ n: string; r: string; e: number } | null> {
  if (!token || !token.includes('.')) {
    return null;
  }
  const [body, sig] = token.split('.');
  const expected = await hmacHex(secret, body);
  if (sig.length !== expected.length) {
    return null;
  }
  let same = 0;
  for (let i = 0; i < expected.length; i += 1) {
    same |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (same !== 0) {
    return null;
  }
  try {
    const payload = JSON.parse(fromBase64Url(body)) as { n: string; r: string; e: number };
    if (!payload.n || typeof payload.e !== 'number') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function randomToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function discordAvatar(id: string, hash: string | null): string | null {
  if (hash) {
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.png`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) % 5n)}.png`;
}

async function startDiscord(request: Request, env: Env, url: URL): Promise<Response> {
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return redirect(appendError(returnTo, 'auth_not_configured'));
  }

  const payload = { n: randomToken(16), r: returnTo, e: Date.now() + OAUTH_MS };
  const state = await signState(env.SESSION_SECRET, payload);
  const authorize = new URL('https://discord.com/oauth2/authorize');
  authorize.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirectUri(request, env));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'identify');
  authorize.searchParams.set('state', state);

  return redirect(authorize.toString(), {
    'set-cookie': cookieHeader(OAUTH_COOKIE, state, {
      maxAge: OAUTH_MS / 1000,
      secure: isSecure(request, env),
    }),
  });
}

async function discordCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const fallback = '/';
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return redirect(appendError(fallback, 'auth_not_configured'));
  }

  const payload =
    (await readState(env.SESSION_SECRET, url.searchParams.get('state'))) ??
    (await readState(env.SESSION_SECRET, readCookie(request, OAUTH_COOKIE)));
  const returnTo = safeReturnTo(payload?.r ?? fallback);
  const clearOauth = clearCookie(OAUTH_COOKIE, isSecure(request, env));

  if (!payload || payload.e < Date.now()) {
    return redirect(appendError(returnTo, 'discord'), { 'set-cookie': clearOauth });
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return redirect(appendError(returnTo, 'discord'), { 'set-cookie': clearOauth });
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(request, env),
    }),
  });
  if (!tokenRes.ok) {
    return redirect(appendError(returnTo, 'discord'), { 'set-cookie': clearOauth });
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    return redirect(appendError(returnTo, 'discord'), { 'set-cookie': clearOauth });
  }

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) {
    return redirect(appendError(returnTo, 'discord'), { 'set-cookie': clearOauth });
  }

  const user = (await userRes.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar: string | null;
  };

  const now = Date.now();
  const username = (user.global_name || user.username || 'Discord user').slice(0, 64);
  const avatar = discordAvatar(user.id, user.avatar);
  const sessionId = randomToken();

  await env.DB.prepare(
    `INSERT INTO users (discord_id, username, avatar, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar`,
  )
    .bind(user.id, username, avatar, now)
    .run();

  await env.DB.prepare('DELETE FROM sessions WHERE discord_id = ? AND expires_at < ?')
    .bind(user.id, now)
    .run();

  await env.DB.prepare('INSERT INTO sessions (id, discord_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, user.id, now, now + SESSION_MS)
    .run();

  const headers = new Headers({ location: returnTo });
  headers.append('set-cookie', clearOauth);
  headers.append(
    'set-cookie',
    cookieHeader(SESSION_COOKIE, sessionId, {
      maxAge: SESSION_MS / 1000,
      secure: isSecure(request, env),
    }),
  );
  return new Response(null, { status: 302, headers });
}

async function getSession(request: Request, env: Env): Promise<SessionRow | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) {
    return null;
  }
  const row = await env.DB.prepare(
    `SELECT s.id, s.discord_id, s.expires_at, u.username, u.avatar
     FROM sessions s
     JOIN users u ON u.discord_id = s.discord_id
     WHERE s.id = ?`,
  )
    .bind(token)
    .first<SessionRow>();
  if (!row) {
    return null;
  }
  if (row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(row.id).run();
    return null;
  }
  return row;
}

async function logout(request: Request, env: Env): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
  }
  return json(
    { ok: true },
    200,
    {
      'set-cookie': clearCookie(SESSION_COOKIE, isSecure(request, env)),
    },
  );
}

async function me(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return json({ user: null });
  }
  return json({
    user: {
      username: session.username,
      avatar: session.avatar,
      isAdmin: isAdmin(env, session.discord_id),
    },
  });
}

function mapReply(row: ReplyRow) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: {
      username: row.username,
      avatar: row.avatar,
    },
  };
}

function mapReport(row: ReportRow, mine: boolean, replies: ReplyRow[] = []) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    minecraftVersion: row.minecraft_version,
    modVersion: row.mod_version,
    status: row.status,
    createdAt: row.created_at,
    author: {
      username: row.username,
      avatar: row.avatar,
    },
    replies: replies.map(mapReply),
    mine,
  };
}

async function listReports(request: Request, url: URL, env: Env): Promise<Response> {
  const kind = url.searchParams.get('kind') ?? '';
  const slug = url.searchParams.get('project') ?? '';
  if (!isKnownProject(kind, slug)) {
    return json({ error: 'Unknown project' }, 400);
  }

  const session = await getSession(request, env);
  const admin = session ? isAdmin(env, session.discord_id) : false;

  let query = `SELECT r.id, r.type, r.title, r.body, r.minecraft_version, r.mod_version, r.status, r.created_at,
            u.username, u.avatar, r.author_discord_id
     FROM reports r
     JOIN users u ON u.discord_id = r.author_discord_id
     WHERE r.project_kind = ? AND r.project_slug = ? AND r.hidden = 0`;
  const binds: unknown[] = [kind, slug];

  if (!admin) {
    if (session) {
      query += ' AND (r.type = ? OR r.author_discord_id = ?)';
      binds.push('feedback', session.discord_id);
    } else {
      query += ' AND r.type = ?';
      binds.push('feedback');
    }
  }

  query += ' ORDER BY r.created_at DESC LIMIT 200';

  const result = await env.DB.prepare(query).bind(...binds).all<ReportRow>();
  const rows = result.results ?? [];
  const repliesByReport = new Map<number, ReplyRow[]>();

  if (rows.length > 0) {
    const placeholders = rows.map(() => '?').join(', ');
    const replyResult = await env.DB.prepare(
      `SELECT rp.id, rp.report_id, rp.body, rp.created_at, u.username, u.avatar
       FROM replies rp
       JOIN users u ON u.discord_id = rp.author_discord_id
       WHERE rp.report_id IN (${placeholders})
       ORDER BY rp.created_at ASC`,
    )
      .bind(...rows.map((row) => row.id))
      .all<ReplyRow>();
    for (const reply of replyResult.results ?? []) {
      const list = repliesByReport.get(reply.report_id) ?? [];
      list.push(reply);
      repliesByReport.set(reply.report_id, list);
    }
  }

  return json({
    reports: rows.map((row) =>
      mapReport(row, Boolean(session && row.author_discord_id === session.discord_id), repliesByReport.get(row.id) ?? []),
    ),
  });
}

function trimField(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\r\n/g, '\n').trim().slice(0, max);
}

async function createReport(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return json({ error: 'Sign in with Discord to submit' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const kind = typeof body.kind === 'string' ? body.kind : '';
  const slug = typeof body.project === 'string' ? body.project : '';
  if (!isKnownProject(kind, slug)) {
    return json({ error: 'Unknown project' }, 400);
  }

  const type = body.type === 'bug' || body.type === 'feedback' ? body.type : null;
  const title = trimField(body.title, TITLE_MAX);
  const text = trimField(body.body, BODY_MAX);
  const minecraftVersion = trimField(body.minecraftVersion, VERSION_MAX) || null;
  const modVersion = trimField(body.modVersion, VERSION_MAX) || null;

  if (!type) {
    return json({ error: 'Choose bug or feedback' }, 400);
  }
  if (title.length < 4) {
    return json({ error: 'Title needs a few more words' }, 400);
  }
  if (text.length < 8) {
    return json({ error: 'Add a bit more detail' }, 400);
  }

  const since = Date.now() - RATE_WINDOW_MS;
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) as n FROM reports WHERE author_discord_id = ? AND created_at > ?',
  )
    .bind(session.discord_id, since)
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) >= RATE_LIMIT) {
    return json({ error: 'Slow down — you can submit a few reports per hour' }, 429);
  }

  const now = Date.now();
  const inserted = await env.DB.prepare(
    `INSERT INTO reports (
       project_kind, project_slug, type, title, body, minecraft_version, mod_version,
       status, hidden, author_discord_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 0, ?, ?)`,
  )
    .bind(kind as FeedbackProjectKind, slug, type, title, text, minecraftVersion, modVersion, session.discord_id, now)
    .run();

  const id = inserted.meta.last_row_id;
  return json({
    report: {
      id,
      type,
      title,
      body: text,
      minecraftVersion,
      modVersion,
      status: 'open',
      createdAt: now,
      author: {
        username: session.username,
        avatar: session.avatar,
      },
      replies: [],
      mine: true,
    },
  }, 201);
}

async function updateReport(request: Request, env: Env, id: number): Promise<Response> {
  const session = await getSession(request, env);
  if (!session || !isAdmin(env, session.discord_id)) {
    return json({ error: 'Not allowed' }, 403);
  }
  if (!Number.isInteger(id) || id < 1) {
    return json({ error: 'Unknown report' }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM reports WHERE id = ? AND hidden = 0')
    .bind(id)
    .first<{ id: number }>();
  if (!existing) {
    return json({ error: 'Unknown report' }, 404);
  }

  if (body.hidden === true) {
    await env.DB.prepare('UPDATE reports SET hidden = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true, hidden: true });
  }

  if (body.status === 'open' || body.status === 'closed') {
    await env.DB.prepare('UPDATE reports SET status = ? WHERE id = ?').bind(body.status, id).run();
    return json({ ok: true, status: body.status });
  }

  return json({ error: 'Nothing to update' }, 400);
}

async function createReply(request: Request, env: Env, id: number): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return json({ error: 'Sign in with Discord to reply' }, 401);
  }
  if (!Number.isInteger(id) || id < 1) {
    return json({ error: 'Unknown report' }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const text = trimField(body.body, BODY_MAX);
  if (text.length < 4) {
    return json({ error: 'Add a bit more detail' }, 400);
  }

  const report = await env.DB.prepare(
    'SELECT id, type, hidden, author_discord_id FROM reports WHERE id = ?',
  )
    .bind(id)
    .first<{ id: number; type: string; hidden: number; author_discord_id: string }>();
  if (!report || report.hidden) {
    return json({ error: 'Unknown report' }, 404);
  }

  const admin = isAdmin(env, session.discord_id);
  const mine = report.author_discord_id === session.discord_id;
  if (report.type === 'bug' && !admin && !mine) {
    return json({ error: 'Not allowed' }, 403);
  }
  if (!admin && !mine) {
    return json({ error: 'Not allowed' }, 403);
  }

  const since = Date.now() - RATE_WINDOW_MS;
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) as n FROM replies WHERE author_discord_id = ? AND created_at > ?',
  )
    .bind(session.discord_id, since)
    .first<{ n: number }>();
  if ((countRow?.n ?? 0) >= 20) {
    return json({ error: 'Slow down — you can reply a few times per hour' }, 429);
  }

  const now = Date.now();
  const inserted = await env.DB.prepare(
    'INSERT INTO replies (report_id, author_discord_id, body, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id, session.discord_id, text, now)
    .run();

  return json({
    reply: {
      id: inserted.meta.last_row_id,
      body: text,
      createdAt: now,
      author: {
        username: session.username,
        avatar: session.avatar,
      },
    },
  }, 201);
}
