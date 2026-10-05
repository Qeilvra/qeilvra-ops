import { createHash, randomBytes } from "node:crypto";
export { RecoveryCipher } from "@airmech/identity";
import { BadRequestException } from "@nestjs/common";

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
export function tokenDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function cookieToken(header: string | undefined, name: string): string | null {
  const matches = (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]?.slice(name.length + 1) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function requireFields(body: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new BadRequestException();
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !fields.includes(key))) throw new BadRequestException();
  return record;
}
export function inputText(
  record: Record<string, unknown>,
  field: string,
  maximum: number,
  minimum = 1,
): string {
  const value = record[field];
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new BadRequestException();
  return value;
}
export function inputEmail(record: Record<string, unknown>): string {
  const value = inputText(record, "email", 320).trim().toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)) throw new BadRequestException();
  return value;
}
