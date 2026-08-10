/**
 * Password hashing — scrypt via Node crypto.
 * Format: cost$salt$keyHex
 * Example: 14$a1b2c3d4...$e5f6g7h8...
 */

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = parseInt(process.env.AUTH_SCRYPT_KEYLEN ?? "64", 10);
const SALT_LEN = parseInt(process.env.AUTH_SCRYPT_SALT_LEN ?? "16", 10);
const COST = parseInt(process.env.AUTH_SCRYPT_COST ?? "14", 10); // N = 2^cost

export function hashPassword(plaintext: string): string {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const key = scryptSync(plaintext, salt, KEYLEN, { N: 2 ** COST, r: 8, p: 1 });
  return `${COST}$${salt}$${key.toString("hex")}`;
}

export function verifyPassword(plaintext: string, storedHash: string): boolean {
  const parts = storedHash.split("$");

  // Handle old format: "hashed:plaintext" (from legacy code)
  if (storedHash.startsWith("hashed:")) {
    return storedHash === `hashed:${plaintext}`;
  }

  // Handle old format: "salt:keyHex" (no cost prefix)
  if (parts.length === 2) {
    const [salt, keyHex] = parts;
    if (!salt || !keyHex) return false;
    try {
      const key = scryptSync(plaintext, salt, KEYLEN);
      return timingSafeEqual(key, Buffer.from(keyHex, "hex"));
    } catch {
      return false;
    }
  }

  // New format: "cost$salt$keyHex"
  if (parts.length === 3) {
    const [costStr, salt, keyHex] = parts;
    if (!costStr || !salt || !keyHex) return false;
    try {
      const N = 2 ** parseInt(costStr, 10);
      const key = scryptSync(plaintext, salt, KEYLEN, { N, r: 8, p: 1 });
      return timingSafeEqual(key, Buffer.from(keyHex, "hex"));
    } catch {
      return false;
    }
  }

  return false;
}
