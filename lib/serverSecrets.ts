import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isSecretAuthorized(request: Request, secret: string | undefined) {
  if (!secret?.trim()) return false;
  const expected = Buffer.from(`Bearer ${secret.trim()}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
