// SAMPLE k6 load test. Run:  k6 run performance/k6/sample.load.js
// Config via env:  PERF_BASE_URL, VUS, DURATION.  Thresholds are the pass/fail gate.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.PERF_BASE_URL || "https://test.k6.io";

export const options = {
    scenarios: {
        smoke: {
            executor: "constant-vus",
            vus: Number(__ENV.VUS || 5),
            duration: __ENV.DURATION || "30s",
        },
    },
    thresholds: {
        http_req_failed: ["rate<0.01"], // <1% errors
        http_req_duration: ["p(95)<500"], // 95th percentile < 500ms
    },
};

export default function () {
    const res = http.get(`${BASE}/`);
    check(res, { "status is 200": (r) => r.status === 200 });
    sleep(1);
}

// Export a machine-readable summary the AI-QA pipeline can ingest.
export function handleSummary(data) {
    return { "test-output/k6-summary.json": JSON.stringify(data, null, 2) };
}
