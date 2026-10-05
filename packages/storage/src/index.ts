import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import type { ServerConfiguration } from "@airmech/config/server";

export type StorageErrorCode =
  | "STORAGE_DISABLED"
  | "INVALID_STORAGE_CONFIGURATION"
  | "STORAGE_FORBIDDEN"
  | "INVALID_STORAGE_FILE"
  | "INVALID_STORAGE_REFERENCE"
  | "STORAGE_BUCKET_NOT_PRIVATE"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_PROVIDER_FAILURE"
  | "INVALID_STORAGE_RESPONSE";

const messages: Record<StorageErrorCode, string> = {
  STORAGE_DISABLED: "Private storage is disabled. Configure storage before using it.",
  INVALID_STORAGE_CONFIGURATION: "Private storage configuration is invalid. Correct its settings.",
  STORAGE_FORBIDDEN: "This file operation is not authorized.",
  INVALID_STORAGE_FILE: "The file size, content, type, or extension is unsupported.",
  INVALID_STORAGE_REFERENCE: "The file owner, entity reference, or storage key is invalid.",
  STORAGE_BUCKET_NOT_PRIVATE: "The configured storage bucket must be private.",
  STORAGE_UNAVAILABLE: "Private storage is unavailable. Retry the operation later.",
  STORAGE_PROVIDER_FAILURE:
    "Private storage rejected the operation. Check access and configuration.",
  INVALID_STORAGE_RESPONSE: "Private storage returned an invalid response.",
};

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    readonly status: number | null = null,
  ) {
    super(messages[code]);
    this.name = "StorageError";
  }
}

export interface StorageReference {
  readonly ownerId: string;
  readonly entityType: string;
  readonly entityId: string;
}

export interface StoredObject extends StorageReference {
  readonly key: string;
}

export interface StorageAuthorizationRequest {
  readonly actorId: string;
  readonly action: "upload" | "download" | "metadata" | "delete";
  readonly object: StoredObject;
}

export interface StorageOptions {
  readonly authorize?: (request: StorageAuthorizationRequest) => boolean | Promise<boolean>;
  readonly requestTimeoutMs?: number;
}

export interface UploadRequest extends StorageReference {
  readonly actorId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly body: Uint8Array | AsyncIterable<Uint8Array>;
}

export interface StorageMetadata {
  readonly object: StoredObject;
  readonly size: number;
  readonly mimeType: string;
}

export const MAX_FILE_SIZE = 6 * 1024 * 1024;
export const MAX_SIGNED_URL_SECONDS = 300;

const extensions: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
});
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const keyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|jpe?g|png|txt|csv)$/;

/** Server-only adapter. Construction does no I/O; callers inject object-level authorization. */
export class StorageService {
  readonly #configuration: ServerConfiguration["storage"];
  readonly #authorize: NonNullable<StorageOptions["authorize"]>;
  readonly #timeoutMs: number;
  readonly #baseUrl: string | null;

  constructor(configuration: ServerConfiguration["storage"], options: StorageOptions = {}) {
    this.#configuration = Object.freeze({ ...configuration });
    this.#authorize = options.authorize ?? (() => false);
    this.#timeoutMs = options.requestTimeoutMs ?? 15_000;
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > 60_000) {
      throw new StorageError("INVALID_STORAGE_CONFIGURATION");
    }
    this.#baseUrl = null;
    if (configuration.enabled) {
      if (
        configuration.supabaseUrl === null ||
        configuration.serviceRoleKey === null ||
        configuration.bucket === null
      ) {
        throw new StorageError("INVALID_STORAGE_CONFIGURATION");
      }
      try {
        const url = new URL(configuration.supabaseUrl);
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (
          (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
          url.username.length > 0 ||
          url.password.length > 0 ||
          url.search.length > 0 ||
          url.hash.length > 0 ||
          url.pathname !== "/" ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(configuration.bucket) ||
          configuration.serviceRoleKey.length === 0 ||
          /\s/.test(configuration.serviceRoleKey)
        )
          throw new StorageError("INVALID_STORAGE_CONFIGURATION");
        this.#baseUrl = `${url.origin}/storage/v1`;
      } catch {
        throw new StorageError("INVALID_STORAGE_CONFIGURATION");
      }
    }
  }

  /** Read-only readiness probe; never creates buckets or changes access policies. */
  async verifyPrivateBucket(): Promise<void> {
    const data = await this.#request(`/bucket/${this.#bucket()}`);
    if (!isRecord(data) || data.id !== this.#configuration.bucket || data.public !== false) {
      throw new StorageError("STORAGE_BUCKET_NOT_PRIVATE");
    }
  }

  async upload(request: UploadRequest): Promise<StorageMetadata> {
    const reference = validateReference(request);
    if (
      typeof request.filename !== "string" ||
      request.filename.length === 0 ||
      request.filename.length > 255 ||
      /[/\\]/.test(request.filename) ||
      hasControlCharacter(request.filename, false) ||
      !Number.isInteger(request.size) ||
      request.size < 1 ||
      request.size > MAX_FILE_SIZE
    )
      throw new StorageError("INVALID_STORAGE_FILE");
    const extension = request.filename.includes(".")
      ? request.filename.split(".").at(-1)?.toLowerCase()
      : undefined;
    const allowedExtensions = Object.hasOwn(extensions, request.mimeType)
      ? extensions[request.mimeType]
      : undefined;
    if (!extension || !allowedExtensions?.includes(extension)) {
      throw new StorageError("INVALID_STORAGE_FILE");
    }
    if (request.body instanceof Uint8Array && request.body.byteLength !== request.size) {
      throw new StorageError("INVALID_STORAGE_FILE");
    }
    const object = Object.freeze({
      ...reference,
      key: `${prefix(reference)}/${randomUUID()}.${extension}`,
    });
    await this.#allow(request.actorId, "upload", object);
    await this.verifyPrivateBucket();
    let uploadError: StorageError | null = null;
    const stream = Readable.from(
      checkedBody(request.body, request.size, request.mimeType, (error) => {
        uploadError = error;
      }),
      { objectMode: false },
    );
    try {
      await this.#request(`/object/${this.#bucket()}/${object.key}`, {
        method: "POST",
        body: Readable.toWeb(stream),
        duplex: "half",
        headers: {
          "content-type": request.mimeType,
          "content-length": String(request.size),
          "cache-control": "private, max-age=0",
          "x-upsert": "false",
          "x-metadata": Buffer.from(JSON.stringify(reference)).toString("base64"),
        },
      });
    } catch (error: unknown) {
      if (uploadError !== null) throw uploadError;
      throw error;
    } finally {
      stream.destroy();
    }
    return Object.freeze({ object, size: request.size, mimeType: request.mimeType });
  }

  async getSignedDownloadUrl(
    actorId: string,
    object: StoredObject,
    expiresIn = 60,
  ): Promise<string> {
    const validated = validateObject(object);
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_SIGNED_URL_SECONDS) {
      throw new StorageError("INVALID_STORAGE_FILE");
    }
    await this.#allow(actorId, "download", validated);
    await this.verifyPrivateBucket();
    const data = await this.#request(`/object/sign/${this.#bucket()}/${validated.key}`, {
      method: "POST",
      body: JSON.stringify({ expiresIn }),
      headers: { "content-type": "application/json" },
    });
    if (!isRecord(data) || typeof data.signedURL !== "string" || data.signedURL.length > 8192) {
      throw new StorageError("INVALID_STORAGE_RESPONSE");
    }
    // Supabase returns a storage-relative path. Accept only the requested object's signed route.
    const expectedPath = `/object/sign/${this.#bucket()}/${validated.key}`;
    let signed: URL;
    try {
      signed = new URL(`${this.#baseUrl}${data.signedURL}`);
    } catch {
      throw new StorageError("INVALID_STORAGE_RESPONSE");
    }
    if (
      !data.signedURL.startsWith(`${expectedPath}?`) ||
      signed.pathname !== `/storage/v1${expectedPath}` ||
      !signed.searchParams.get("token") ||
      signed.hash.length > 0
    )
      throw new StorageError("INVALID_STORAGE_RESPONSE");
    return signed.href;
  }

  async metadata(actorId: string, object: StoredObject): Promise<StorageMetadata> {
    const validated = validateObject(object);
    await this.#allow(actorId, "metadata", validated);
    await this.verifyPrivateBucket();
    const data = await this.#request(`/object/info/${this.#bucket()}/${validated.key}`);
    if (!isRecord(data)) throw new StorageError("INVALID_STORAGE_RESPONSE");
    const metadata = isRecord(data.metadata) ? data.metadata : null;
    const size = metadata?.size ?? data.size;
    const mimeType = metadata?.mimetype ?? data.content_type;
    if (
      typeof size !== "number" ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      typeof mimeType !== "string"
    ) {
      throw new StorageError("INVALID_STORAGE_RESPONSE");
    }
    return Object.freeze({ object: validated, size, mimeType });
  }

  async delete(actorId: string, object: StoredObject): Promise<void> {
    const validated = validateObject(object);
    await this.#allow(actorId, "delete", validated);
    await this.verifyPrivateBucket();
    await this.#request(`/object/${this.#bucket()}`, {
      method: "DELETE",
      body: JSON.stringify({ prefixes: [validated.key] }),
      headers: { "content-type": "application/json" },
    });
  }

  #bucket(): string {
    if (!this.#configuration.enabled) throw new StorageError("STORAGE_DISABLED");
    return encodeURIComponent(this.#configuration.bucket ?? "");
  }

  async #allow(
    actorId: string,
    action: StorageAuthorizationRequest["action"],
    object: StoredObject,
  ): Promise<void> {
    this.#bucket();
    if (typeof actorId !== "string" || !identifierPattern.test(actorId))
      throw new StorageError("STORAGE_FORBIDDEN");
    let allowed: boolean;
    try {
      allowed = (await this.#authorize(Object.freeze({ actorId, action, object }))) === true;
    } catch {
      throw new StorageError("STORAGE_FORBIDDEN");
    }
    if (!allowed) throw new StorageError("STORAGE_FORBIDDEN");
  }

  async #request(route: string, options: RequestInit = {}): Promise<unknown> {
    this.#bucket();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    timer.unref();
    try {
      const response = await fetch(`${this.#baseUrl}${route}`, {
        ...options,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          ...options.headers,
          apikey: this.#configuration.serviceRoleKey ?? "",
          authorization: `Bearer ${this.#configuration.serviceRoleKey ?? ""}`,
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new StorageError(
          response.status >= 500 || response.status === 429
            ? "STORAGE_UNAVAILABLE"
            : "STORAGE_PROVIDER_FAILURE",
          response.status,
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new StorageError("INVALID_STORAGE_RESPONSE");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const value: unknown = result.value;
          if (!(value instanceof Uint8Array)) throw new StorageError("INVALID_STORAGE_RESPONSE");
          size += value.byteLength;
          if (size > 65_536) {
            await reader.cancel();
            throw new StorageError("INVALID_STORAGE_RESPONSE");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      return data;
    } catch (error: unknown) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        error instanceof SyntaxError ? "INVALID_STORAGE_RESPONSE" : "STORAGE_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateReference(reference: StorageReference): StorageReference {
  if (
    ![reference.ownerId, reference.entityType, reference.entityId].every(
      (value) => typeof value === "string" && identifierPattern.test(value),
    )
  ) {
    throw new StorageError("INVALID_STORAGE_REFERENCE");
  }
  return Object.freeze({
    ownerId: reference.ownerId,
    entityType: reference.entityType,
    entityId: reference.entityId,
  });
}

function prefix(reference: StorageReference): string {
  return `${reference.entityType}/${reference.entityId}/${reference.ownerId}`;
}

function validateObject(object: StoredObject): StoredObject {
  const reference = validateReference(object);
  if (
    typeof object.key !== "string" ||
    !object.key.startsWith(`${prefix(reference)}/`) ||
    !keyPattern.test(object.key.slice(prefix(reference).length + 1))
  ) {
    throw new StorageError("INVALID_STORAGE_REFERENCE");
  }
  return Object.freeze({ ...reference, key: object.key });
}

async function* checkedBody(
  body: UploadRequest["body"],
  size: number,
  mimeType: string,
  onError: (error: StorageError) => void,
): AsyncGenerator<Uint8Array> {
  try {
    const source = body instanceof Uint8Array ? [body] : body;
    let count = 0;
    let header = Buffer.alloc(0);
    let checked = false;
    const decoder = mimeType.startsWith("text/") ? new TextDecoder("utf-8", { fatal: true }) : null;
    for await (const chunk of source) {
      if (!(chunk instanceof Uint8Array)) throw new StorageError("INVALID_STORAGE_FILE");
      count += chunk.byteLength;
      if (count > size) throw new StorageError("INVALID_STORAGE_FILE");
      if (decoder) {
        try {
          const text = decoder.decode(chunk, { stream: true });
          if (hasControlCharacter(text, true)) throw new StorageError("INVALID_STORAGE_FILE");
        } catch {
          throw new StorageError("INVALID_STORAGE_FILE");
        }
      }
      if (checked) {
        yield chunk;
        continue;
      }
      const take = Math.min(8 - header.length, chunk.byteLength);
      header = Buffer.concat([header, chunk.subarray(0, take)]);
      if (header.length === 8) {
        checkHeader(header, mimeType);
        checked = true;
        yield header;
        if (chunk.byteLength > take) yield chunk.subarray(take);
      }
    }
    if (count !== size) throw new StorageError("INVALID_STORAGE_FILE");
    if (decoder) {
      try {
        decoder.decode();
      } catch {
        throw new StorageError("INVALID_STORAGE_FILE");
      }
    }
    if (!checked) {
      checkHeader(header, mimeType);
      yield header;
    }
  } catch (error: unknown) {
    const safeError =
      error instanceof StorageError ? error : new StorageError("INVALID_STORAGE_FILE");
    onError(safeError);
    throw safeError;
  }
}

function checkHeader(header: Uint8Array, mimeType: string): void {
  const signature =
    mimeType === "application/pdf"
      ? [37, 80, 68, 70, 45]
      : mimeType === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10]
        : mimeType === "image/jpeg"
          ? [255, 216, 255]
          : [];
  if (!signature.every((byte, index) => header[index] === byte))
    throw new StorageError("INVALID_STORAGE_FILE");
}

function hasControlCharacter(value: string, allowTextWhitespace: boolean): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 127 || (code < 32 && !(allowTextWhitespace && [9, 10, 13].includes(code))))
      return true;
  }
  return false;
}
