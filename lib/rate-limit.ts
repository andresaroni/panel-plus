type Attempt = { count: number; resetAt: number };

const globalForRateLimit = globalThis as unknown as {
  loginAttempts?: Map<string, Attempt>;
};

const attempts = globalForRateLimit.loginAttempts ?? new Map<string, Attempt>();
globalForRateLimit.loginAttempts = attempts;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function isLoginBlocked(key: string) {
  const current = attempts.get(key);
  if (!current) return false;
  if (current.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

export function registerLoginFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
