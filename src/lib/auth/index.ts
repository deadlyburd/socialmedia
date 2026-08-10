/**
 * Auth module barrel export.
 *
 * Authentication is handled by Supabase Auth.
 * This module exports complementary utilities:
 *   - Password hashing (scrypt) — for forgot/reset password flows
 *   - Rate limiting (token bucket)
 *   - User store (Supabase-backed profile records)
 *   - Hono middleware adapter (requireAuth, optionalAuth, requireTenantAccess)
 *
 * Usage:
 *   import { requireAuth, hashPassword, rateLimitByIP } from "@/lib/auth";
 */

export { hashPassword, verifyPassword } from "./password";
export { RateLimiter, authRateLimiter, rateLimitByIP, rateLimitByEmail } from "./rate-limit";
export { requireAuth, requireTenantAccess, optionalAuth, getClientIP } from "./hono-adapter";
export type { SessionPayload } from "./hono-adapter";
export {
  createUser,
  getUserByEmail,
  getUserById,
  verifyUserCredentials,
  updateUser,
  markOnboardingComplete,
  isOnboardingComplete,
} from "./user-store";
export type { StoredUser } from "./user-store";
