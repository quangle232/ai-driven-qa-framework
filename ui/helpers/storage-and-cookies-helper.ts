import fs from 'fs';
import path from 'path';

export function mergeStorageStates(
    filePath1: string,
    filePath2: string,
    outputFileName: string = 'merged-storage.json'
): string {
    const absPath1 = path.resolve(filePath1);
    const absPath2 = path.resolve(filePath2);

    if (!fs.existsSync(absPath1)) {
        throw new Error(`File not found: ${absPath1}`);
    }

    if (!fs.existsSync(absPath2)) {
        throw new Error(`File not found: ${absPath2}`);
    }

    const state1 = JSON.parse(fs.readFileSync(absPath1, 'utf-8'));
    const state2 = JSON.parse(fs.readFileSync(absPath2, 'utf-8'));

    const merged = {
        cookies: mergeCookies(state1.cookies || [], state2.cookies || []),
        origins: mergeOrigins(state1.origins || [], state2.origins || [])
    };

    const outputPath = path.resolve(`.auth/${outputFileName}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));

    return outputPath;
}

function mergeCookies(c1: any[], c2: any[]) {
    const map = new Map();

    [...c1, ...c2].forEach(cookie => {
        const key = `${cookie.name}-${cookie.domain}-${cookie.path}`;
        map.set(key, cookie); // overwrite on duplicate key
    });

    return Array.from(map.values());
}

function mergeOrigins(o1: any[], o2: any[]) {
    const map = new Map();

    [...o1, ...o2].forEach(origin => {
        map.set(origin.origin, origin); // overwrite on duplicate key
    });

    return Array.from(map.values());
}
