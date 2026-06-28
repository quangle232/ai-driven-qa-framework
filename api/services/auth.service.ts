/**
 * AuthService — Service-Object Model for the auth endpoints.
 *
 * The API analogue of a Page Object: typed methods per endpoint group, schema
 * validation centralised here, never a raw `request` call in a spec.
 */
import { ApiClient, ApiResult } from "../clients/api-client";
import {
    ErrorResponse,
    ErrorResponseSchema,
    LoginRequest,
    LoginResponse,
    LoginResponseSchema,
} from "../models/sample.model";

export class AuthService {
    constructor(private readonly api: ApiClient) {}

    /** POST /auth/login — returns a token + the authenticated user. */
    login(credentials: LoginRequest): Promise<ApiResult<LoginResponse>> {
        return this.api.post<LoginResponse>("/auth/login", {
            body: credentials,
            schema: LoginResponseSchema,
            expectedStatus: 200,
        });
    }

    /** POST /auth/login with bad credentials — asserts the 401 error envelope. */
    loginExpectingUnauthorized(credentials: LoginRequest): Promise<ApiResult<ErrorResponse>> {
        return this.api.post<ErrorResponse>("/auth/login", {
            body: credentials,
            schema: ErrorResponseSchema,
            expectedStatus: 401,
        });
    }
}
