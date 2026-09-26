import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(nodeScrypt);

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("password must be at least 12 characters");
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltText, hashText] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createSession(secret: string): { token: string; digest: string } {
  if (secret.length < 32) throw new Error("session secret must be at least 32 characters");
  const token = randomBytes(32).toString("base64url");
  return { token, digest: sessionDigest(token, secret) };
}
export function sessionDigest(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}
