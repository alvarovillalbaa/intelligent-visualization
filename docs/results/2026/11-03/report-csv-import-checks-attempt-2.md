# Report CSV176 — focused attempt 2

The [focused run 41737159189](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/41737159189) failed on 2026-11-03. All **168 unit checks passed**; **six browser cases passed and two timed out**, so **174/176 passed** and full acceptance remains unproven. The [JSON receipt](report-csv-import-checks-attempt-2.json) retains every unit identity, every browser title/profile pair, actual phases and diagnostic report hashes.

- Activation: `c57370e076909ea1ebc25f82c898bc90cd95258c`; checked source: `435e69ef7d5c1e17377bf448d277c26b4d3a3836`.
- [Source seal](report-csv-import-source-repaired.json): 373 inputs, SHA-256 `400b25a03fc3cd6f31f94ac91656fdc51171c03655a1cd79d9dc730672cc5bfe`. Pre/post path, mode, byte and hash guards passed. Strict outcome validation then failed on the two browser results.
- Actual profile: Ubuntu 24.04.5, Node v24.21.0, Playwright 1.58.2. Four unit files and all eight browser identities exactly matched the seal; there were no skips, retries, flaky or global browser errors.

Both desktop and mobile reached `slow.ready:end`, then `slow.header-toggle:begin` without its end marker. Their first actionable errors were `locator.click` / `locator.tap` timeouts at the label filter in copied spec line 238. The `has` locator re-entered the ancestor dialog/section from inside a label. This conflicts with Playwright’s [relative inner-locator contract](https://playwright.dev/docs/api/class-locator#locator-filter). The later header, replacement, release and cancellation assertions in those two cases were not reached.

After timeout, restore emitted the fixed cleanup-failure marker and dispose completed; the original click/tap error was preserved. The runner’s identity-checked cleanup succeeded and reported: “Owned Report CSV tooling/output and copied files removed.” Full temporary reports were removed; reduced outcomes and their actual byte hashes are retained. No independent process inventory was recorded.

The [separate normal-CI receipt](report-csv-import-normal-ci-attempt-2.md) records its 41 Course fixture failures and skipped downstream steps. Root’s later local Course path normalization and the proposed descendant-only locator correction were not tested by these runs. No run was restarted, and no local test, browser check or publication was performed while collecting this evidence. The original attempt-1 receipts remain historical. Receipt authored 2026-11-04.
