/**
 * UserService — Service-Object Model for the /users endpoints.
 *
 * Methods return the validated, typed `ApiResult<T>`; specs assert on it.
 * "Raw" reads (e.g. expecting a 404) use `expectedStatus` so the negative
 * case is explicit, not an accidental throw.
 */
import { ApiClient, ApiResult } from "../clients/api-client";
import {
    CreateUserRequest,
    ErrorResponse,
    ErrorResponseSchema,
    User,
    UserListSchema,
    UserSchema,
} from "../models/sample.model";

export class UserService {
    constructor(private readonly api: ApiClient) {}

    /** GET /users — list all users. */
    list(): Promise<ApiResult<User[]>> {
        return this.api.get<User[]>("/users", {
            schema: UserListSchema,
            expectedStatus: 200,
        });
    }

    /** GET /users/:id — fetch one user (200). */
    getById(id: string): Promise<ApiResult<User>> {
        return this.api.get<User>(`/users/${id}`, {
            schema: UserSchema,
            expectedStatus: 200,
        });
    }

    /** GET /users/:id expecting a NOT-FOUND — returns the error envelope (404). */
    getByIdExpectingNotFound(id: string): Promise<ApiResult<ErrorResponse>> {
        return this.api.get<ErrorResponse>(`/users/${id}`, {
            schema: ErrorResponseSchema,
            expectedStatus: 404,
        });
    }

    /** POST /users — create a user (201). */
    create(body: CreateUserRequest): Promise<ApiResult<User>> {
        return this.api.post<User>("/users", {
            body,
            schema: UserSchema,
            expectedStatus: 201,
        });
    }

    /** POST /users with an invalid body — asserts the 400 error envelope. */
    createExpectingBadRequest(body: unknown): Promise<ApiResult<ErrorResponse>> {
        return this.api.post<ErrorResponse>("/users", {
            body,
            schema: ErrorResponseSchema,
            expectedStatus: 400,
        });
    }

    /** DELETE /users/:id — remove a user (204). */
    remove(id: string): Promise<ApiResult<unknown>> {
        return this.api.delete(`/users/${id}`, { expectedStatus: 204 });
    }
}
