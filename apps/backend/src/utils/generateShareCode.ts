import crypto from "crypto";

export function generateShareCode(length: number = 6): string {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length)
    .toUpperCase();
}
