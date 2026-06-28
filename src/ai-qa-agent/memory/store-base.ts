/**
 * Shared JSON-file store base for memory.
 *
 * Stores live under `.aiqa-memory/<name>.json` at the repo root. Hand-
 * editable so teams can curate domain knowledge directly. Every store has
 * a fixed schema version + records[] shape; the loader is forgiving (a
 * malformed file becomes "empty" rather than crashing the framework).
 *
 * Write guard: every mutator checks `AIQA_ALLOW_MEMORY_WRITE`. With the
 * env unset, writes throw — the MCP memory server then turns this into a
 * structured error and the client surfaces "memory writes disabled". This
 * mirrors the master prompt's "no destructive default" stance.
 */

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../utils/paths";

export const MEMORY_DIR = path.resolve(REPO_ROOT, ".aiqa-memory");

export interface MemoryDoc<T> {
    schemaVersion: string;
    updatedAt: string;
    records: T[];
}

export class MemoryWritesDisabledError extends Error {
    constructor() {
        super("memory writes are disabled — set AIQA_ALLOW_MEMORY_WRITE=true to enable hand-editing through the agent.");
    }
}

function ensureDir(): void {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

export function writesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
    const v = (env.AIQA_ALLOW_MEMORY_WRITE ?? "").toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

export function loadDoc<T>(name: string, schemaVersion: string): MemoryDoc<T> {
    const file = path.join(MEMORY_DIR, `${name}.json`);
    if (!fs.existsSync(file)) {
        return { schemaVersion, updatedAt: new Date().toISOString(), records: [] };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8")) as MemoryDoc<T>;
        // Forgive missing fields — never throw on hand-edited memory.
        return {
            schemaVersion: raw.schemaVersion ?? schemaVersion,
            updatedAt: raw.updatedAt ?? new Date().toISOString(),
            records: Array.isArray(raw.records) ? raw.records : [],
        };
    } catch {
        return { schemaVersion, updatedAt: new Date().toISOString(), records: [] };
    }
}

export function saveDoc<T>(name: string, doc: MemoryDoc<T>): void {
    if (!writesAllowed()) throw new MemoryWritesDisabledError();
    ensureDir();
    const file = path.join(MEMORY_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...doc, updatedAt: new Date().toISOString() }, null, 2));
}

export function appendRecord<T>(name: string, schemaVersion: string, record: T): MemoryDoc<T> {
    const doc = loadDoc<T>(name, schemaVersion);
    doc.records.push(record);
    saveDoc(name, doc);
    return doc;
}
