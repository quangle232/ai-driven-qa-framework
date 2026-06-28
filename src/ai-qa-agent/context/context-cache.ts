/**
 * In-memory + on-disk cache for context blocks.
 *
 * Two layers:
 *   - Process-local Map for the current run (fast).
 *   - `.aiqa-cache/context/<hash>.txt` survives across CLI invocations.
 *
 * Keys are SHA-256 hashes of `{kind, sourceMtimes, version}` so a change to
 * any input file invalidates the cache automatically.
 *
 * This is what makes Anthropic's prompt cache pay off: the same exact
 * framework-context block is produced across runs as long as the source
 * files haven't moved, so the model's cached prefix actually hits.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT } from "../utils/paths";

const CACHE_VERSION = "v1";
const CACHE_ROOT = path.resolve(REPO_ROOT, ".aiqa-cache/context");

function ensureCacheDir(): void {
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
}

function mtimeSig(paths: string[]): string {
    return paths.map(p => {
        try {
            const st = fs.statSync(p);
            return `${p}:${st.mtimeMs}:${st.size}`;
        } catch {
            return `${p}:missing`;
        }
    }).join("|");
}

export function cacheKey(kind: string, sources: string[]): string {
    const sig = `${CACHE_VERSION}::${kind}::${mtimeSig(sources)}`;
    return crypto.createHash("sha256").update(sig).digest("hex").slice(0, 32);
}

const mem = new Map<string, string>();

export function getCachedContext(key: string): string | null {
    if (mem.has(key)) return mem.get(key)!;
    const file = path.join(CACHE_ROOT, `${key}.txt`);
    if (!fs.existsSync(file)) return null;
    const v = fs.readFileSync(file, "utf8");
    mem.set(key, v);
    return v;
}

export function putCachedContext(key: string, value: string): void {
    mem.set(key, value);
    ensureCacheDir();
    fs.writeFileSync(path.join(CACHE_ROOT, `${key}.txt`), value);
}
