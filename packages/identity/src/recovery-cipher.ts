import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Bounded recovery/outbox encryption shared by trusted API and worker processes. */
export class RecoveryCipher {
  readonly #key: Buffer;
  constructor(secret: string) {
    this.#key = createHash("sha256").update(`airmech-recovery-v1:${secret}`).digest();
  }
  seal(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from("airmech-recovery-v1"));
    return Buffer.concat([
      iv,
      cipher.update(value, "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64url");
  }
  open(value: string): string {
    try {
      const bytes = Buffer.from(value, "base64url");
      if (bytes.length < 29 || bytes.length > 24_000) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", this.#key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from("airmech-recovery-v1"));
      decipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(
        "utf8",
      );
    } catch {
      throw new Error("Recovery envelope could not be verified.");
    }
  }
}
