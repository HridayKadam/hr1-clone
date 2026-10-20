import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { get, run, setting } from './db.js';
import { HttpError, forbidden, isHR } from './util.js';

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  let s = setting('jwt_secret');
  if (!s) { s = crypto.randomBytes(48).toString('hex'); run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'jwt_secret', s); }
  return s;
}

const COOKIE = 'hr_token';
const cookieOpts = () => ({
  httpOnly: true, sameSite: 'lax', path: '/', maxAge: 1000 * 60 * 60 * 24 * 14,
  secure: process.env.COOKIE_SECURE === '1',
});

export function issue(res, employee) {
  const token = jwt.sign({ sub: employee.id }, secret(), { expiresIn: '14d' });
  res.cookie(COOKIE, token, cookieOpts());
}
export const clear = (res) => res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });

export const PUBLIC_USER_COLS = `id, emp_code, first_name, last_name, email, role, manager_id, department_id, designation_id, location_id, shift_id, status, doj`;

export function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new HttpError(401, 'Please sign in'));
  try {
    const { sub } = jwt.verify(token, secret());
    const user = get(`SELECT ${PUBLIC_USER_COLS} FROM employees WHERE id = ?`, sub);
    if (!user || user.status !== 'active') return next(new HttpError(401, 'Your account is inactive'));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again'));
  }
}

export const requireHR = (req, _res, next) => (isHR(req.user) ? next() : next(forbidden('HR or admin access required')));
export const requireAdmin = (req, _res, next) => (req.user?.role === 'admin' ? next() : next(forbidden('Admin access required')));
export const requireManager = (req, _res, next) => (['admin', 'hr', 'manager'].includes(req.user?.role) ? next() : next(forbidden('Manager access required')));
