import { readFileSync } from "fs"; // run on Jenkins

const reportPath = process.env.REPORT_PATH;
const report = JSON.parse(readFileSync(reportPath, "utf8"));

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
let totalFlaky = 0;
let totalUnstable = 0;

const projectNames = new Set();
const matrixMap = new Map();
const failedTests = [];
const projectStats = {};

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDuration(ms) {
    if (!ms || ms <= 0) return "0s";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? m + "m " + sec + "s" : sec + "s";
}

function normalizeStatus(test, results) {
    const hasPass = results.some(r => String(r?.status || "").toLowerCase() === "passed");
    const hasFail = results.some(r => {
        const s = String(r?.status || "").toLowerCase();
        return s === "failed" || s === "timedout" || s === "interrupted";
    });
    const hasSkip = results.some(r => String(r?.status || "").toLowerCase() === "skipped");

    const st = String(test?.status || "").toLowerCase();
    const outcome = String(test?.outcome || "").toLowerCase();

    if (hasFail && hasPass) return "FLAKY";
    if (outcome === "flaky" || test?.flaky === true) return "FLAKY";

    if (st === "passed" || st === "expected") return "PASSED";
    if (st === "failed" || st === "timedout" || st === "interrupted") return "FAILED";
    if (st === "skipped") return "SKIPPED";

    if (hasPass) return "PASSED";
    if (hasFail) return "FAILED";
    if (hasSkip) return "SKIPPED";

    return "UNSTABLE";
}

function detectDomain(...candidates) {
    const joined = candidates
        .filter(Boolean)
        .map(v => String(v).replace(/\\/g, "/").toLowerCase())
        .join(" | ");

    if (joined.includes("sample")) {
        return "sample";
    }

    return "-";
}

function ensureProject(project) {
    if (!projectStats[project]) {
        projectStats[project] = {
            passed: 0,
            failed: 0,
            skipped: 0,
            flaky: 0,
            unstable: 0,
            total: 0
        };
    }
}

function updateProject(project, status) {
    ensureProject(project);
    projectStats[project].total++;

    if (status === "PASSED") projectStats[project].passed++;
    else if (status === "FAILED") projectStats[project].failed++;
    else if (status === "SKIPPED") projectStats[project].skipped++;
    else if (status === "FLAKY") projectStats[project].flaky++;
    else projectStats[project].unstable++;
}

function getConfiguredProjectNames(reportJson) {
    const configProjects = reportJson?.config?.projects;
    if (!Array.isArray(configProjects)) return [];
    return configProjects
        .map(p => p?.name)
        .filter(Boolean);
}

const configuredProjects = getConfiguredProjectNames(report);
const configuredProjectSet = new Set(configuredProjects);

function findProjectFromAncestors(ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const title = ancestors[i];
        if (configuredProjectSet.has(title)) return title;
    }
    return "";
}

function getProjectName(test, results, ancestors) {
    for (const r of results) {
        if (r?.projectName) return r.projectName;
        if (r?.project?.name) return r.project.name;
    }

    if (test?.projectName) return test.projectName;
    if (test?.project?.name) return test.project.name;

    const fromAncestors = findProjectFromAncestors(ancestors);
    if (fromAncestors) return fromAncestors;

    return "";
}

function statusBadge(status) {
    if (status === "PASSED") return '<span style="color:#16a34a;font-weight:bold;">PASSED</span>';
    if (status === "FAILED") return '<span style="color:#dc2626;font-weight:bold;">FAILED</span>';
    if (status === "FLAKY") return '<span style="color:#d97706;font-weight:bold;">FLAKY</span>';
    if (status === "SKIPPED") return '<span style="color:#6b7280;font-weight:bold;">SKIPPED</span>';
    return '<span style="color:#9333ea;font-weight:bold;">UNSTABLE</span>';
}

function walkSuite(suite, ancestors = []) {
    if (!suite) return;

    const nextAncestors = [...ancestors, suite.title || ""];

    if (Array.isArray(suite.specs)) {
        for (const spec of suite.specs) {
            if (!Array.isArray(spec.tests)) continue;

            for (const test of spec.tests) {
                const results = Array.isArray(test.results) ? test.results : [];
                const status = normalizeStatus(test, results);

                const path = test?.location?.file || spec?.location?.file || "";
                const title = test?.title || spec?.title || "Untitled test";

                const domain = detectDomain(
                    path,
                    test?.location?.file,
                    spec?.location?.file,
                    ...(Array.isArray(test?.titlePath) ? test.titlePath : []),
                    ...(Array.isArray(spec?.titlePath) ? spec.titlePath : []),
                    ...nextAncestors,
                    title
                );

                let duration = 0;
                let failedReason = "";

                for (const r of results) {
                    duration += Number(r?.duration || 0);

                    if (!failedReason && r?.error) {
                        failedReason =
                            r.error.message ||
                            r.error.value ||
                            "Unknown error";
                    }
                }

                const projectName = getProjectName(test, results, nextAncestors);
                if (!projectName) continue;

                projectNames.add(projectName);

                if (status === "PASSED") totalPassed++;
                else if (status === "FAILED") totalFailed++;
                else if (status === "SKIPPED") totalSkipped++;
                else if (status === "FLAKY") totalFlaky++;
                else totalUnstable++;

                updateProject(projectName, status);

                if (status === "FAILED") {
                    failedTests.push({
                        project: projectName,
                        title,
                        error: failedReason || "Unknown error"
                    });
                }

                const key = domain + "||" + path + "||" + title;

                if (!matrixMap.has(key)) {
                    matrixMap.set(key, {
                        domain,
                        title,
                        durations: [],
                        statuses: {}
                    });
                }

                const row = matrixMap.get(key);
                row.durations.push(duration);
                row.statuses[projectName] = status;
            }
        }
    }

    if (Array.isArray(suite.suites)) {
        for (const child of suite.suites) {
            walkSuite(child, nextAncestors);
        }
    }
}

if (Array.isArray(report?.suites)) {
    for (const suite of report.suites) {
        walkSuite(suite, []);
    }
}

const projects = [...projectNames].sort((a, b) => a.localeCompare(b));

const projectRows = projects.length
    ? projects.map(p => {
        const s = projectStats[p] || {
            passed: 0,
            failed: 0,
            skipped: 0,
            flaky: 0,
            unstable: 0,
            total: 0
        };

        return `<tr>
<td>${escapeHtml(p)}</td>
<td align="center">${s.total || 0}</td>
<td align="center" style="color:green;"><b>${s.passed || 0}</b></td>
<td align="center" style="color:red;"><b>${s.failed || 0}</b></td>
<td align="center" style="color:#d97706;"><b>${s.flaky || 0}</b></td>
<td align="center" style="color:#9333ea;"><b>${s.unstable || 0}</b></td>
<td align="center" style="color:gray;"><b>${s.skipped || 0}</b></td>
</tr>`;
    }).join("")
    : '<tr><td colspan="7">No project stats found</td></tr>';

const projectTable = `
<h3>Project Result</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;">
<tr style="background:#f2f2f2;">
<th>Project</th>
<th>Total</th>
<th>Passed</th>
<th>Failed</th>
<th>Flaky</th>
<th>Unstable</th>
<th>Skipped</th>
</tr>
${projectRows}
</table>
`;

const failedRows = failedTests.length
    ? failedTests.map(t => {
        return `<tr>
<td>${escapeHtml(t.project)}</td>
<td>${escapeHtml(t.title)}</td>
<td style="color:#dc2626;">${escapeHtml(t.error)}</td>
</tr>`;
    }).join("")
    : '<tr><td colspan="3">No failed test cases</td></tr>';

const failedTable = `
<h3>Failed Test Cases</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;">
<tr style="background:#f2f2f2;">
<th>Project</th>
<th>Test Case</th>
<th>Error</th>
</tr>
${failedRows}
</table>
`;

const matrixRows = [...matrixMap.values()]
    .sort((a, b) => {
        if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
        return a.title.localeCompare(b.title);
    })
    .map(r => {
        const max = r.durations.length ? Math.max(...r.durations) : 0;

        const projectCells = projects.map(p => {
            const st = r.statuses[p];
            return `<td align="center">${st ? statusBadge(st) : "-"}</td>`;
        }).join("");

        return `<tr>
<td align="center">${escapeHtml(r.domain)}</td>
<td>${escapeHtml(r.title)}</td>
<td align="center">${formatDuration(max)}</td>
${projectCells}
</tr>`;
    }).join("");

const matrixTable = `
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
<thead>
<tr>
<th>Domain</th>
<th>Test Case</th>
<th>Duration</th>
${projects.map(p => `<th>${escapeHtml(p)}</th>`).join("")}
</tr>
</thead>
<tbody>
${matrixRows || '<tr><td colspan="999">No executed test cases</td></tr>'}
</tbody>
</table>
`;

const total = totalPassed + totalFailed + totalSkipped + totalFlaky + totalUnstable;
const passRate = total ? ((totalPassed / total) * 100).toFixed(1) + "%" : "0%";

console.log(JSON.stringify({
    projectTable,
    failedTable,
    matrixTable,
    totalPassed,
    totalFailed,
    totalSkipped,
    totalFlaky,
    totalUnstable,
    total,
    passRate
}));
