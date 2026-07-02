/**
 * In-memory mock business logic, shared by BOTH mock layers (MSW + the
 * standalone Express server) so they can never drift apart.
 *
 * Each method returns `{ status, body }`; the transport adapters just map that
 * onto their response object. `reset()` restores the seed so every test starts
 * from a known state (test isolation).
 */
import { randomUUID } from "node:crypto";
import { CreateUserRequestSchema, LoginRequest, User } from "../models/sample.model";

export interface MockResponse {
    status: number;
    body: unknown;
}

const VALID_CREDENTIALS = { username: "demo", password: "demo-pass" };

const SEED_USERS: User[] = [
    { id: "u-1", username: "demo", email: "demo@example.com", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "u-2", username: "alice", email: "alice@example.com", createdAt: "2026-01-02T00:00:00.000Z" },
];

export class MockApiStore {
    private users: User[] = [];

    constructor() {
        this.reset();
    }

    reset(): void {
        this.users = SEED_USERS.map(u => ({ ...u }));
    }

    listUsers(): MockResponse {
        return { status: 200, body: this.users };
    }

    getUser(id: string): MockResponse {
        const user = this.users.find(u => u.id === id);
        if (!user) {
            return { status: 404, body: { error: "not_found", message: `User ${id} does not exist` } };
        }
        return { status: 200, body: user };
    }

    createUser(input: unknown): MockResponse {
        const parsed = CreateUserRequestSchema.safeParse(input);
        if (!parsed.success) {
            return {
                status: 400,
                body: { error: "bad_request", message: parsed.error.issues.map(i => i.message).join("; ") },
            };
        }
        if (this.users.some(u => u.username === parsed.data.username)) {
            return { status: 409, body: { error: "conflict", message: "username already taken" } };
        }
        const user: User = {
            id: `u-${randomUUID().slice(0, 8)}`,
            username: parsed.data.username,
            email: parsed.data.email,
            createdAt: new Date().toISOString(),
        };
        this.users.push(user);
        return { status: 201, body: user };
    }

    deleteUser(id: string): MockResponse {
        const before = this.users.length;
        this.users = this.users.filter(u => u.id !== id);
        if (this.users.length === before) {
            return { status: 404, body: { error: "not_found", message: `User ${id} does not exist` } };
        }
        return { status: 204, body: undefined };
    }

    login(input: unknown): MockResponse {
        const creds = input as Partial<LoginRequest>;
        if (creds?.username === VALID_CREDENTIALS.username && creds?.password === VALID_CREDENTIALS.password) {
            const user = this.users.find(u => u.username === creds.username)!;
            return { status: 200, body: { token: "mock-jwt-token", user } };
        }
        return { status: 401, body: { error: "unauthorized", message: "invalid credentials" } };
    }
}

/** Process-wide singleton; the Express app and MSW handlers share it. */
export const mockStore = new MockApiStore();
