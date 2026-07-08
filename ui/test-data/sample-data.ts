/**
 * Inputs and expected values for the sample spec.
 *
 * Convention: keep test data OUT of the spec — specs describe the flow,
 * test-data/* describes the values.
 */
import { randomUUID } from 'node:crypto';

export const sampleInput = {
    email: 'tester@example.com',
};

export const sampleExpected = {
    headingContains: 'Welcome',
};

/**
 * Factory for CRUD-lifecycle samples (framework-conventions §12).
 * UNIQUE per call (uuid suffix) so parallel workers and `--retries` never
 * collide on the same record; override any field per test.
 */
export function makeSampleUser(overrides: Partial<{ username: string; email: string }> = {}) {
    const suffix = randomUUID().slice(0, 8);
    return {
        username: `aiqa-user-${suffix}`,
        email: `aiqa-user-${suffix}@example.com`,
        ...overrides,
    };
}
