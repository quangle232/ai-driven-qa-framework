/**
 * ApiClient — the single HTTP interaction layer for API tests.
 *
 * This is the API-side analogue of `helper/action-keywords.ts` (`ActionKeyword`)
 * for the UI: it is the ONLY place that touches the transport. Specs talk to
 * `api/services/*` (Service-Object Model); services talk to this client; nothing
 * calls Playwright's `request` directly.
 *
 * Why Playwright's `APIRequestContext` (not axios)?
 *   - It is the framework's runner-native client: requests show up in the
 *     Playwright trace / HTML report, honour proxy + ignoreHTTPSErrors, and
 *     share the test timeout budget. One reporting pipeline, no extra plumbing.
 *
 * Best practices baked in:
 *   - central base URL + auth + default timeout (no per-call magic strings)
 *   - per-call duration capture (assert response-time SLAs in specs)
 *   - optional `expectedStatus` assertion with a stakeholder-friendly message
 *   - optional `zod` schema validation so contract drift fails loudly
 */
import type { APIRequestContext, APIResponse } from "@playwright/test";
import type { ZodType } from "zod";

export interface ApiClientOptions {
    request: APIRequestContext;
    baseURL: string;
    /** Bearer token applied to every request unless overridden per-call. */
    token?: string;
    defaultTimeoutMs?: number;
}

export interface ApiCallOptions<T> {
    /** Validate (and type) the JSON body against this schema. */
    schema?: ZodType<T>;
    /** Request JSON body (POST/PUT/PATCH). */
    body?: unknown;
    /** Query string params. */
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    /** Per-call bearer token override. */
    token?: string;
    /** If set, assert the response status equals this (or one of these). */
    expectedStatus?: number | number[];
    timeoutMs?: number;
}

export interface ApiResult<T> {
    status: number;
    ok: boolean;
    headers: Record<string, string>;
    data: T;
    durationMs: number;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiClient {
    private readonly request: APIRequestContext;
    private readonly baseURL: string;
    private readonly token?: string;
    private readonly defaultTimeoutMs: number;

    constructor(options: ApiClientOptions) {
        this.request = options.request;
        this.baseURL = options.baseURL.replace(/\/+$/, "");
        this.token = options.token;
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    }

    get<T = unknown>(path: string, opts: ApiCallOptions<T> = {}) {
        return this.send<T>("GET", path, opts);
    }
    post<T = unknown>(path: string, opts: ApiCallOptions<T> = {}) {
        return this.send<T>("POST", path, opts);
    }
    put<T = unknown>(path: string, opts: ApiCallOptions<T> = {}) {
        return this.send<T>("PUT", path, opts);
    }
    patch<T = unknown>(path: string, opts: ApiCallOptions<T> = {}) {
        return this.send<T>("PATCH", path, opts);
    }
    delete<T = unknown>(path: string, opts: ApiCallOptions<T> = {}) {
        return this.send<T>("DELETE", path, opts);
    }

    private async send<T>(method: Method, path: string, opts: ApiCallOptions<T>): Promise<ApiResult<T>> {
        const url = this.buildUrl(path);
        const token = opts.token ?? this.token;
        const headers: Record<string, string> = {
            accept: "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...opts.headers,
        };

        const started = Date.now();
        let response: APIResponse;
        try {
            response = await this.request.fetch(url, {
                method,
                headers,
                params: opts.params,
                data: opts.body as any,
                timeout: opts.timeoutMs ?? this.defaultTimeoutMs,
            });
        } catch (err) {
            // Network / timeout — translate into a clear, one-line message.
            throw new Error(
                `API ${method} ${url} failed before a response: ${(err as Error).message}`,
            );
        }
        const durationMs = Date.now() - started;
        const status = response.status();

        // Parse body defensively: empty body (e.g. 204) is fine.
        const raw = await response.text();
        let parsed: unknown = undefined;
        if (raw) {
            try {
                parsed = JSON.parse(raw);
            } catch {
                parsed = raw; // non-JSON payload; keep as text
            }
        }

        this.assertStatus(method, url, status, parsed, opts.expectedStatus);

        const data = opts.schema ? this.validate(method, url, opts.schema, parsed) : (parsed as T);

        return {
            status,
            ok: response.ok(),
            headers: response.headers(),
            data,
            durationMs,
        };
    }

    private buildUrl(path: string): string {
        if (/^https?:\/\//i.test(path)) return path;
        return `${this.baseURL}/${path.replace(/^\/+/, "")}`;
    }

    private assertStatus(
        method: string,
        url: string,
        status: number,
        body: unknown,
        expected?: number | number[],
    ): void {
        if (expected === undefined) return;
        const allowed = Array.isArray(expected) ? expected : [expected];
        if (allowed.includes(status)) return;
        throw new Error(
            `API ${method} ${url} returned ${status}, expected ${allowed.join(" or ")}.\n` +
                `Response: ${this.snippet(body)}`,
        );
    }

    private validate<T>(method: string, url: string, schema: ZodType<T>, body: unknown): T {
        const result = schema.safeParse(body);
        if (result.success) return result.data;
        const issues = result.error.issues
            .slice(0, 5)
            .map(i => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n");
        throw new Error(
            `API ${method} ${url} response failed schema validation:\n${issues}\n` +
                `Response: ${this.snippet(body)}`,
        );
    }

    private snippet(body: unknown): string {
        const s = typeof body === "string" ? body : JSON.stringify(body);
        if (!s) return "(empty)";
        return s.length > 300 ? `${s.slice(0, 297)}...` : s;
    }
}
