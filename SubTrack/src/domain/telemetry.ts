import { createHash } from "node:crypto";
const sensitiveKey = /(token|secret|password|email|name|account|description|correction)/i;
export function pseudonymize(value: string, salt: string): string { return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 20); }
export function safeEvent(name: string, fields: Readonly<Record<string, unknown>>, salt: string): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (sensitiveKey.test(key)) continue;
    sanitized[key === "actorId" || key === "householdId" ? `${key}Hash` : key] = key === "actorId" || key === "householdId" ? pseudonymize(String(value), salt) : value;
  }
  return { name, ...sanitized };
}
