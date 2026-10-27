# Compact combined account presentation

Status: source published; existing CI and production build passed. Browser interaction and account actions were not checked.

The [owning Notion QA](https://app.notion.com/p/3b6a1ee8bd06808bb0bff40e0d6eb034), fetched again on 2026-10-27, requests registration and login together, a smaller title, and no description. Baseline [`f20cc745cf88aeef7b507e9bf1fb95e739992875`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/f20cc745cf88aeef7b507e9bf1fb95e739992875) already rendered both forms together and used `mode` only to order the cards.

The account page now has a smaller “Your account” heading and no promotional introduction. The two card headings are smaller, and their descriptive copy is removed. Existing form content, loading/error states, card ordering, and session/action logic are retained.

Changed product files: [account page](../../../../app/auth/page.tsx) and [form presentation](../../../../components/slides/auth-forms.tsx). This is a copy/typography change; no Auth policy, account provider, credentials, migration, dependencies, or CI configuration changes are included.

Node 24.21.0 with the existing TypeScript 5.9.3 parser accepted both files. Exact AST text comparison against the baseline confirms that both complete form subtrees, both `useActionState` calls, the session lookup, and the redirect are unchanged. Form SHA-256 values remain `c8c6e22cc034ff36616c88e2a4229a73156860066125281dec6f60e432e2aa65` and `cfc6e05142885710dbacadb3cd4735819c663ca7d25cae58694dcabc64192405`. Auth action/server/provider files compare unchanged. Independent read-only review and `git diff --check` pass.

Published source: [`d0cfb6ca29dab9c80a53fbe08cd0593dfe6b786e`](https://github.com/alvarovillalbaa/intelligent-visualization/commit/d0cfb6ca29dab9c80a53fbe08cd0593dfe6b786e). The unchanged automatic [CI run 40538026311](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/40538026311) completed successfully. Vercel production deployment `dpl_HM6wzVyWKqxsKKfdEvudEHc7rddy` was read back as `READY` at that exact source SHA and owns the canonical alias. A connected fetch of [the account page](https://intelligent-visualization.vercel.app/auth) returned HTTP 200 with “Your account” and both form headings. This establishes hosted presentation delivery, not successful account operations.

No new tests were added for this reversible presentation change. No local install/build, browser check, account creation, sign-in, registration, email delivery, or model call was performed. The pending source-input browser proposal remains restricted to its four anonymous composer scenarios.
