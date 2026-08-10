/**
 * In-memory reset code store — shared between forgot-password and reset-password routes.
 * Replace with Redis/DB in production.
 */
export const resetCodes = new Map<string, { code: string; expiresAt: number }>();
