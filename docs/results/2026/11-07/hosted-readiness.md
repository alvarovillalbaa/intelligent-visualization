# Hosted readiness metadata

Read-only connected Supabase discovery on 7 November 2026, approximately
02:54–02:55 UTC. No hosted project was selected or changed.

The organization detail API explicitly reported Clous on `free` / `tier_free`.
The project listing returned seven projects: two `ACTIVE_HEALTHY` and five
`INACTIVE`. Detail reads confirmed both active statuses. No Intelligent
Visualization project appeared in the returned list.

These metadata APIs exposed no remaining quota, usage, capacity or headroom,
safe-reuse ownership, or isolation evidence. A free existing target usable
without downtime or a paid plan therefore remains unverified. Project names and
statuses do not establish that conclusion.

Only organization/project metadata was read. No SQL, customer rows, credentials,
keys, cost confirmation, project creation, pause/resume, migration, role, config,
Auth or account operation occurred. No Vercel environment request was retried.

## Vercel deployment metadata refresh

At 03:02:01–03:02:16 UTC on 7 November 2026, three metadata reads scoped only to
Intelligent Visualization confirmed production remains `READY` on `main` source
`a5fa01331281ac8d38eb135a1dcc381d6adb4ecc`. The existing deployment retains the
canonical alias `intelligent-visualization.vercel.app`.

The latest work-branch deployment is a new nonproduction Preview (`target: null`),
`READY` at source `380d56020fd13977d35a61a78a7ee3a93f98dc13`:
[Preview URL](https://intelligent-visualization-laqylustn-my-team-4f230354.vercel.app).

No environment, secret or configuration request was made; the earlier environment
403 was not retried. No deployment or other setting was changed. These records
establish deployment metadata only, without page, Auth or database proof.
Application CI acceptance remains pending; this snapshot does not establish the
deployment's trigger cause or hosted application readiness.

## Exact-source Preview metadata refresh

Two read-only calls at approximately 04:27–04:28 UTC scoped to this project's
work branch returned deployment `dpl_26HPgPmHcWSLvWS2hhoFLfqi5uou`: `READY`,
nonproduction `target: null`, source `f7d39323af22a7eada88b4bd5bfd7d6c116b9b74`.
Both the filtered deployment list and fresh deployment detail report that source:
[Preview URL](https://intelligent-visualization-4yxjvnaio-my-team-4f230354.vercel.app).
This replaces the older work-source snapshot above for metadata only. The active
[application diagnostic](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42338448718)
has no terminal verdict yet. No page, authentication, database, production alias,
environment, secret or billing request was made; no deployment/configuration
mutation or retry of the existing environment 403 occurred. READY is not application
or hosted acceptance, and the production snapshot above was not refreshed here.

Later result: that [application diagnostic](supabase-application-attempt-6.md)
finished with all four journeys failed at 04:31:16 UTC. Its native-reader observations
do not establish network or application completion. The exact-source READY Preview
metadata above therefore remains distinct from application acceptance.

## Publishing-feedback Preview metadata

At approximately 05:01 UTC, two read-only metadata calls (exact commit-filtered
deployment list and fresh detail) reported `dpl_FxwJRcTPCbAjcTmWNC3vWhGgihNT`
READY, nonproduction `target: null`, for feedback source
`2ca24133bdb154321638a9950793ed34e45545fa`:
[Preview URL](https://intelligent-visualization-5ooj7ti60-my-team-4f230354.vercel.app).
This confirms metadata/build readiness only. The feedback has source review,
without a runtime result; attempt 7 tested an earlier source. No page, environment,
secret, production alias, configuration or billing request was made, and the
environment 403 was not retried.
