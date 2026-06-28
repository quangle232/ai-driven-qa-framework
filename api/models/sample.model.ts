/**
 * API contract models — zod schemas + inferred TS types.
 *
 * Convention (mirrors the POM `data-*` discipline for the UI side):
 *   - One schema per resource / request / response.
 *   - Specs and services validate responses against these schemas so a
 *     contract drift fails the test loudly instead of leaking a bad shape.
 *   - Types are INFERRED from the schema (`z.infer`) — never hand-written and
 *     kept in sync — so the runtime check and the compile-time type cannot diverge.
 *
 * Replace `sample`/`User` with your real resources.
 */
import { z } from "zod";

export const UserSchema = z.object({
    id: z.string(),
    username: z.string(),
    email: z.string().email(),
    createdAt: z.string(), // ISO-8601
});
export type User = z.infer<typeof UserSchema>;

export const UserListSchema = z.array(UserSchema);

export const CreateUserRequestSchema = z.object({
    username: z.string().min(3),
    email: z.string().email(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const LoginRequestSchema = z.object({
    username: z.string(),
    password: z.string(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
    token: z.string(),
    user: UserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/** Standard error envelope returned by the API on 4xx/5xx. */
export const ErrorResponseSchema = z.object({
    error: z.string(),
    message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
