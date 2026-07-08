/**
 * SampleUserApi — SAMPLE service-object for API-assisted setup/teardown in web tests.
 *
 * This is the pattern framework-conventions §12 (CRUD test-data lifecycle) expects:
 * a thin, typed service over `ApiClient` (ui/helpers/api-support.ts) that a UI spec
 * uses to CREATE precondition data and to DELETE everything it created in teardown.
 * Specs never call the transport directly — they call methods on this service.
 *
 * Replace with your app's real supporting endpoints (search `sample` to find what
 * to swap). To try it as-is, run the bundled mock: `yarn mock:api` (port 4010).
 */
import type { APIRequestContext } from "@playwright/test";
import { z } from "zod";
import { ApiClient } from "./api-support";

export const SampleUserSchema = z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    createdAt: z.string(),
});
export type SampleUser = z.infer<typeof SampleUserSchema>;

export interface NewSampleUser {
    username: string;
    email: string;
}

export class SampleUserApi {
    private readonly client: ApiClient;

    constructor(request: APIRequestContext, baseURL?: string) {
        this.client = new ApiClient({
            request,
            // Point at your app's API; defaults to the bundled mock (`yarn mock:api`).
            baseURL: baseURL ?? process.env.SUPPORT_API_URL ?? "http://127.0.0.1:4010",
            token: process.env.API_TOKEN,
        });
    }

    /** Seed a user as a test PRECONDITION — via API, never through the UI. */
    async createUser(input: NewSampleUser): Promise<SampleUser> {
        const res = await this.client.post<SampleUser>("/users", {
            body: input,
            expectedStatus: 201,
            schema: SampleUserSchema,
        });
        return res.data;
    }

    /**
     * Teardown delete — IDEMPOTENT: 404 (already gone) is accepted so a
     * half-failed test can still clean up its remaining resources.
     */
    async deleteUser(id: string): Promise<void> {
        await this.client.delete(`/users/${id}`, { expectedStatus: [204, 404] });
    }
}
