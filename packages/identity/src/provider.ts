import type { ServerConfiguration } from "@airmech/config/server";

export class IdentityProviderError extends Error {
  constructor(
    readonly code: "INVALID_CREDENTIALS" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE",
    readonly status?: number,
  ) {
    super(`Identity operation failed (${code}).`);
    this.name = "IdentityProviderError";
  }
}

export interface VerifiedIdentity {
  readonly identityId: string;
  readonly email: string;
  readonly accessToken: string;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
  return value as Record<string, unknown>;
}

/** Small server-only adapter for Supabase's documented Auth REST API. No persisted SDK session. */
export class SupabaseAuthProvider {
  readonly #base: string;
  readonly #anon: string;
  readonly #admin: string;

  constructor(configuration: ServerConfiguration) {
    const { supabaseUrl, anonKey, serviceRoleKey } = configuration.storage;
    if (!supabaseUrl || !anonKey || !serviceRoleKey)
      throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
    this.#base = `${new URL(supabaseUrl).origin}/auth/v1`;
    this.#anon = anonKey;
    this.#admin = serviceRoleKey;
  }

  async #request(
    path: string,
    body?: object,
    options: { token?: string; admin?: boolean; method?: string } = {},
  ): Promise<Record<string, unknown>> {
    try {
      const key = options.admin ? this.#admin : this.#anon;
      const response = await fetch(`${this.#base}${path}`, {
        method: options.method ?? (body ? "POST" : "GET"),
        headers: {
          apikey: key,
          Authorization: `Bearer ${options.token ?? key}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new IdentityProviderError(
          response.status === 429
            ? "RATE_LIMITED"
            : response.status >= 500
              ? "PROVIDER_UNAVAILABLE"
              : "INVALID_CREDENTIALS",
          response.status,
        );
      }
      if (response.status === 204) return {};
      const reader = response.body?.getReader();
      if (!reader) throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const value: unknown = result.value;
          if (!(value instanceof Uint8Array))
            throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
          length += value.byteLength;
          if (length > 65_536) throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return record(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
    } catch (error: unknown) {
      if (error instanceof IdentityProviderError) throw error;
      throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
    }
  }

  #identity(response: Record<string, unknown>): VerifiedIdentity {
    const user = record(response.user);
    if (
      typeof user.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(user.id) ||
      typeof user.email !== "string" ||
      typeof response.access_token !== "string" ||
      response.access_token.length > 16_384
    )
      throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
    return { identityId: user.id, email: user.email, accessToken: response.access_token };
  }

  async signIn(email: string, password: string): Promise<VerifiedIdentity> {
    return this.#identity(await this.#request("/token?grant_type=password", { email, password }));
  }

  async requestRecovery(email: string, challenge: string, callback: string): Promise<void> {
    await this.#request(`/recover?redirect_to=${encodeURIComponent(callback)}`, {
      email,
      code_challenge: challenge,
      code_challenge_method: "s256",
    });
  }

  async recoverInvitation(email: string, callback: string, identityId: string): Promise<void> {
    const user = await this.#request(`/admin/users/${identityId}`, undefined, { admin: true });
    if (
      user.id !== identityId ||
      typeof user.email !== "string" ||
      user.email.toLowerCase() !== email.toLowerCase() ||
      typeof user.email_confirmed_at !== "string"
    )
      throw new IdentityProviderError("INVALID_CREDENTIALS");
    await this.#request(`/recover?redirect_to=${encodeURIComponent(callback)}`, { email });
  }

  async exchangeRecovery(code: string, verifier: string): Promise<VerifiedIdentity> {
    return this.#identity(
      await this.#request("/token?grant_type=pkce", { auth_code: code, code_verifier: verifier }),
    );
  }

  async verifyInvitation(tokenHash: string): Promise<VerifiedIdentity> {
    return this.#identity(
      await this.#request("/verify", { type: "invite", token_hash: tokenHash }),
    );
  }

  /** Default invitation emails verify at Supabase before redirecting a session fragment. */
  async verifyInvitationSession(accessToken: string): Promise<VerifiedIdentity> {
    if (!accessToken || accessToken.length > 16_384)
      throw new IdentityProviderError("INVALID_CREDENTIALS");
    const user = await this.#request("/user", undefined, { token: accessToken });
    if (
      typeof user.email_confirmed_at !== "string" ||
      !Number.isFinite(Date.parse(user.email_confirmed_at))
    )
      throw new IdentityProviderError("INVALID_CREDENTIALS");
    return this.#identity({ user, access_token: accessToken });
  }

  async updatePassword(accessToken: string, password: string): Promise<void> {
    await this.#request("/user", { password }, { method: "PUT", token: accessToken });
  }

  async invite(email: string, name: string, callback: string): Promise<{ identityId: string }> {
    const user = await this.#request(
      `/invite?redirect_to=${encodeURIComponent(callback)}`,
      { email, data: { display_name: name } },
      { admin: true },
    );
    if (typeof user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id))
      throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
    return { identityId: user.id };
  }

  async createInvitationIdentity(email: string, name: string): Promise<{ identityId: string }> {
    const user = await this.#request(
      "/admin/users",
      {
        email,
        email_confirm: false,
        user_metadata: { display_name: name, purpose: "airmech-user-invitation" },
      },
      { admin: true },
    );
    if (typeof user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id))
      throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
    return { identityId: user.id };
  }

  /** Compensate only a newly provisioned, unconfirmed invitation after a local rollback. */
  async discardUncommittedInvitation(identityId: string, email: string): Promise<void> {
    const user = await this.#request(`/admin/users/${identityId}`, undefined, { admin: true });
    const metadata = record(user.user_metadata);
    if (
      user.id !== identityId ||
      typeof user.email !== "string" ||
      user.email.toLowerCase() !== email.toLowerCase() ||
      user.email_confirmed_at ||
      metadata.purpose !== "airmech-user-invitation"
    )
      throw new IdentityProviderError("INVALID_CREDENTIALS");
    await this.#request(
      `/admin/users/${identityId}`,
      { should_soft_delete: false },
      { admin: true, method: "DELETE" },
    );
  }

  /** Explicit verification/bootstrap tooling only; passwords never enter application persistence. */
  async createTestIdentity(email: string, password: string): Promise<{ identityId: string }> {
    if (!/^codex-auth-test\+[a-z0-9-]+@example\.com$/.test(email))
      throw new IdentityProviderError("INVALID_CREDENTIALS");
    const user = await this.#request(
      "/admin/users",
      {
        email,
        password,
        email_confirm: true,
        user_metadata: { purpose: "temporary-auth-verification" },
      },
      { admin: true },
    );
    if (typeof user.id !== "string") throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
    return { identityId: user.id };
  }

  async deleteTestIdentity(identityId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(identityId))
      throw new IdentityProviderError("INVALID_CREDENTIALS");
    const user = await this.#request(`/admin/users/${identityId}`, undefined, { admin: true });
    if (
      typeof user.email !== "string" ||
      !/^codex-auth-test\+[a-z0-9-]+@example\.com$/.test(user.email)
    )
      throw new IdentityProviderError("INVALID_CREDENTIALS");
    await this.#request(
      `/admin/users/${identityId}`,
      { should_soft_delete: false },
      { admin: true, method: "DELETE" },
    );
    // Verification tooling must confirm cleanup rather than infer it from DELETE.
    try {
      await this.#request(`/admin/users/${identityId}`, undefined, { admin: true });
    } catch (error: unknown) {
      if (error instanceof IdentityProviderError && error.status === 404) return;
      throw error;
    }
    throw new IdentityProviderError("PROVIDER_UNAVAILABLE");
  }
}
