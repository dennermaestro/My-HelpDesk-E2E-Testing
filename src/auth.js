import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { authRequired, forbidden } from './errors.js';

export const ROLES = ['admin', 'support'];
export const SESSION_COOKIE = 'multidesk_session';

const KEY_LENGTH = 64;

/**
 * What each role may do. The server checks these on every request;
 * hiding things in the UI is only a convenience on top.
 */
const ROLE_PERMISSIONS = {
  admin: new Set(['tickets:list', 'tickets:read', 'tickets:create', 'tickets:update', 'tickets:suggest-reply']),
  support: new Set(['tickets:create']),
};

export function can(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** Hashes a password with scrypt and a fresh random salt. Both are stored as hex. */
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(String(password), salt, KEY_LENGTH).toString('hex') };
}

export function verifyPassword(password, { salt, hash }) {
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(String(password), salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Checked when the username does not exist, so a miss costs the same time as a wrong password.
const DUMMY_CREDENTIALS = hashPassword('not-a-real-password');

/**
 * Returns { username, role } when the password matches, otherwise null.
 * The caller never learns whether it was the username or the password that failed.
 */
export function authenticate(repository, username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return null;
  }
  const user = repository.findUser(username.trim().toLowerCase());
  const valid = verifyPassword(password, user ?? DUMMY_CREDENTIALS);
  return user && valid ? { username: user.username, role: user.role } : null;
}

/** In-memory sessions: they live as long as the server process. */
export function createSessionStore() {
  const sessions = new Map();
  return {
    create(user) {
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { username: user.username, role: user.role });
      return token;
    },
    get: (token) => (token ? sessions.get(token) : undefined),
    delete: (token) => sessions.delete(token),
  };
}

export function readSessionToken(req) {
  for (const part of (req.get('Cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return undefined;
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/`;
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Attaches the logged-in user to the request, or answers 401. */
export function requireSession(sessions) {
  return (req, res, next) => {
    const user = sessions.get(readSessionToken(req));
    if (!user) {
      return next(authRequired('Log in to continue'));
    }
    req.user = user;
    return next();
  };
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!can(req.user?.role, permission)) {
      return next(forbidden('Your role does not allow this action'));
    }
    return next();
  };
}
