# Report CSV import checks — attempt 1

[Focused run 41416992025](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/41416992025) failed on **2026-11-02** against source `e6f1e48d1b888b02bc4c18c6559f8f6527860947`; activation was `f460b04db4f5ee4c194eb3c62017b7adff3652b8`. Receipt authored November 3; no new run was started.

**All 168 unit cases passed. Browser results: 5 passed, 1 assertion failure, 2 timed out.** All four unit-suite name sets and eight desktop/mobile title pairs matched the 373-input seal. Browser retries, global reporter errors, skipped and flaky outcomes were zero.

The desktop literal-import case failed its unexpected-request assertion at spec 83:108 because it recorded `GET /__nextjs_font/geist-latin.woff2`. The malformed/canceled-read scenario timed out after 90,000 ms on both profiles. Actual CLI errors identify pending `jsHandle.evaluate` at spec 221:29 after the page/context closed. No underlying timeout cause or source repair is claimed here.

The direct unit command exited 0; browser and strict acceptance exited 1. Pre-install source validation passed. Post-execution HEAD/inventory/all-373-input checks completed before emitting both outcome records; acceptance then rejected the browser failures. Identity-checked owned copies/tooling/output cleanup passed. No separate surviving-process inventory was recorded.

[Machine receipt](report-csv-import-checks-attempt-1.json) retains all actual cases, bounded errors, report hashes, runtime, exits and cleanup. The [normal-CI lint failure](report-csv-import-normal-ci-attempt-1.md) remains separate. No rerun or source repair is included. The fixture uses authored generation/artifact responses; native chooser/download, real-provider/compiler-at-browser-boundary, production Auth/persistence and physical-mobile behavior remain unverified.
