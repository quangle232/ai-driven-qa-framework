/**
 * RestClient — the single HTTP interaction layer for the REST API module.
 *
 * Playwright-FREE (uses axios) so `api/rest` is a pure API-testing module, but the
 * specs still run under the Playwright Test runner to reuse test-output / Allure /
 * the AI-QA pipeline. Specs call `api/rest/services/*` (Service-Object Model);
 * services call this client; nothing calls axios directly.
 *
 * Exposed as `ApiClient` (same public surface as the old Playwright-request client)
 * so the services are unchanged apart from the import path.
 */
import axios, { type AxiosInstance } from "axios";
import type { ZodType } from "zod";

export interface ApiClientOptions {
    baseURL: string;
    token?: string;
    timeoutMs?: number;
}

export interface ApiCallOptions<T> {
    schema?: ZodType<T>;
    body?: unknown;
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    token?: string;
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
    private readonly http: AxiosInstance;
    private readonly token?: string;

    constructor(options: ApiClientOptions) {
        this.token = options.token;
        this.http = axios.create({
            baseURL: options.baseURL.replace(/\/+$/, ""),
            timeout: options.timeoutMs ?? 30_000,
            // We assert status ourselves so 4xx/5xx don't throw.
            validateStatus: () => true,
        });
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
        const token = opts.token ?? this.token;
        const headers: Record<string, string> = {
            accept: "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...opts.headers,
        };

        const started = Date.now();
        let res;
        try {
            res = await this.http.request({
                method,
                url: path,
                headers,
                params: opts.params,
                data: opts.body,
                timeout: opts.timeoutMs,
            });
        } catch (err) {
            throw new Error(`API ${method} ${path} failed before a response: ${(err as Error).message}`);
        }
        const durationMs = Date.now() - started;

        this.assertStatus(method, path, res.status, res.data, opts.expectedStatus);
        const data = opts.schema ? this.validate(method, path, opts.schema, res.data) : (res.data as T);

        return {
            status: res.status,
            ok: res.status >= 200 && res.status < 300,
            headers: res.headers as Record<string, string>,
            data,
            durationMs,
        };
    }

    private assertStatus(method: string, path: string, status: number, body: unknown, expected?: number | number[]): void {
        if (expected === undefined) return;
        const allowed = Array.isArray(expected) ? expected : [expected];
        if (allowed.includes(status)) return;
        throw new Error(
            `API ${method} ${path} returned ${status}, expected ${allowed.join(" or ")}.\nResponse: ${this.snippet(body)}`,
        );
    }

    private validate<T>(method: string, path: string, schema: ZodType<T>, body: unknown): T {
        const result = schema.safeParse(body);
        if (result.success) return result.data;
        const issues = result.error.issues.slice(0, 5).map(i => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
        throw new Error(`API ${method} ${path} response failed schema validation:\n${issues}\nResponse: ${this.snippet(body)}`);
    }

    private snippet(body: unknown): string {
        const s = typeof body === "string" ? body : JSON.stringify(body);
        if (!s) return "(empty)";
        return s.length > 300 ? `${s.slice(0, 297)}...` : s;
    }
}
