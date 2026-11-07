# Verify the real Supabase application factories

Prepared 7 November 2026. Application acceptance remains pending; the third
attempt is an inactive source packet. The prerequisite
[90-case provider packet](../results/2026/11-07/supabase-provider-attempt-8.md)
passed at `4da1844f22a332aad8bd827a026c3a806b4a308f`, with independent
capture/source/cleanup verification. Its exact JSON is 369,374 bytes, SHA-256
`24e75dfa95b776210d369129d2a592f231e7dca8c78741910f1ab18e5ab74441`.
All earlier failed/nonacceptance receipts retain their original verdicts. This
prerequisite does not establish application factories, TLS, browsers or hosted
acceptance; those require the fresh checks below.

The [first application attempt](../results/2026/11-07/supabase-application-attempt-1.md)
failed semantic TypeScript checking before CLI setup, TLS probes, Next or browsers.
Its immutable JSON is 188,352 bytes, SHA-256
`b72f64992213cdc3277ba52c916418d6266bd6871727545a66b3e37b24d54806`, at
`0d9ebd2f6c4bf4d7271d91443b015ed9cfd9edcb`. Four commands ran: three exited
zero and TypeScript exited two; zero provider or browser cases ran. Retry two on
`qa/supabase-application-20261107-2` pins that failed receipt and permits only the
two-line spec correction: a catch callback returns void, and layout reads
`globalThis.document` instead of the shadowing visualization document. All other
285 of its 286 exported inputs remain byte-identical. It carries no cases and
retains the same four identities, probes, time limits, strict guards and cleanup.

The [second application attempt](../results/2026/11-07/supabase-application-attempt-2.json)
remains failed: JSON 487,084 bytes, SHA-256
`eb238d75543631f369f3849730439ca708e940898c5369e38f70c817cc33e326`, source
`380d56020fd13977d35a61a78a7ee3a93f98dc13`. All four browser identities failed
at publish revision two because strict helper stderr contained Node's
`NO_COLOR`/`FORCE_COLOR` warning. Their unproven navigation cancellations
(1/2/2/2) also remain fatal; none is classified harmless. Each created and closed
two contexts before exiting, rather than completing the required four. Positive
factory/TLS, wrong CA, wrong SAN, wrong password and restored-positive probes
passed in the owned fixture. Only the first of two Next-only TLS windows ran;
later journey phases remain unexecuted. This is zero accepted browser cases.

Retry three on `qa/supabase-application-20261107-3` preserves both failed receipts
and the accepted provider prerequisite. Only the browser spec may differ from
attempt two's 286 exported inputs; the other 285 remain byte-identical. Its three
helper `execFile` calls clone the child environment and remove only `FORCE_COLOR`.
`NO_COLOR`, strict empty stderr, every assertion, cancellation failure, all 35
controller functions, probes, four identities, time limits and cleanup remain
unchanged. No cases are carried or accepted by this correction.

## Source boundary

[Persistence selection](../../lib/persistence/factory.ts) and
[storage selection](../../lib/storage/factory.ts) now construct the real Supabase
adapters. The local branches remain unchanged; Supabase initialization is shared,
only healthy instances are cached, and a failed persistence candidate closes its
owned pool. Among the prerequisite's 297 exported inputs, only these two factory
TypeScript files and the explicitly reviewed provider README status text may
differ. The other 294 inputs remain byte-identical. The README exception is
documentation only, not a provider-code allowance. Exercise the new branches
through ordinary environment selection in a fresh Next process. Neither
`setPersistenceProviderForTests`, `setStorageAdapterForTests`, an injected database,
nor an injected fetcher belongs in that process or its fixture setup.

[Portable sign-in](../../lib/server-auth.ts),
[legacy repository operations](../../lib/repository.ts), canonical workspace
services and [legacy file storage](../../lib/storage.ts) already converge on those
factories. Keep `AUTH_PROVIDER=portable`; this is not native Supabase Auth mapping.
Use explicit authored fixture setup through the actual selected factories to
create isolated users/workspaces and static Slides source/originals. Bind fixture
outputs to the returned user/team/workspace/deck IDs, without merging identities
by email. Do not call demo seed, model generation or a new fixture HTTP endpoint.

## Owned TLS fixture with unchanged production validation

Use one fresh disposable CLI 3.0.0 project and its reviewed migration, restricted
runtime role and private bucket. Reuse the accepted controller's archive pin,
source/index/export guards, project/workdir/container ownership checks and stream
closure. CLI configuration has no supported PostgreSQL certificate setting, so
make the following explicit fixture operations after positive container ownership:

1. Reserve the otherwise-unused local DB port 5432 and API/proxy ports. Point the
   CLI DB host port at 5432. Append guarded, exact runner-only DNS aliases for an
   authored 20-character reference: `db.<ref>.supabase.co` and
   `<ref>.supabase.co` resolve only to owned loopback. Refuse pre-existing aliases,
   ports or project resources; this makes no claim of owning a real Supabase DNS
   name or project and makes no request to one.
2. Generate an owned short-lived CA and separate server leaves with the exact DB
   and Storage DNS SANs. Keep keys under the owned scratch directory with mode
   0600. Install the DB leaf/key into the positively identified CLI DB container,
   with the actual PostgreSQL UID and strict key permissions, and enable server
   SSL through explicit admin configuration/reload. Use a bounded restart only if
   required and revalidate container identity/port/readiness afterwards. Do not
   weaken any Supabase application's SQL privileges or TLS policy.
3. Run an owned HTTPS reverse proxy for `<ref>.supabase.co` forwarding only the
   required actual Storage/Kong routes to the already-owned API container. This
   is a real network hop; no fetch rewrite, response fabrication or alternate
   Storage implementation is used. Validate upstream container/host-port binding
   before forwarding and record bounded lifecycle and route metadata, not keys.
4. Start each probe and the app as a fresh Node process with
   `NODE_EXTRA_CA_CERTS=<owned CA certificate>`. Use the unchanged direct URL
   `postgresql://iv_runtime:<disposable password>@db.<ref>.supabase.co:5432/postgres`,
   `PERSISTENCE_PROVIDER=supabase`, `STORAGE_PROVIDER=supabase`,
   `SUPABASE_URL=https://<ref>.supabase.co:<owned HTTPS port>`, a server-only local
   service key and private bucket. `LOCAL_DATABASE_URL` and generic database
   fallbacks stay absent. Preserve `rejectUnauthorized: true`, hostname/servername
   verification and the production URL guard; no explicit per-client CA override,
   `sslmode`, disabled verification, `ignoreHTTPSErrors` or local adapter fallback.

Before starting Next, prove a successful actual `iv_runtime` session has
`pg_stat_ssl.ssl=true`, a negotiated TLS version/cipher and the expected private
lineage/role policy. Probe fresh processes with a wrong CA, a wrong SAN leaf under
the correct CA, and a wrong runtime password; require the corresponding TLS or
authentication failure. Restore the correct owned leaf and repeat the positive
probe after the SAN negative. Close every probe pool before proceeding. In two
explicit Next-only windows, before and after the four journeys, trigger the
ordinary capabilities GET and inspect actual `iv_runtime` connections through a
separate admin connection. Require SSL after every helper process and pool has
closed; this is not continuous observation during the journeys. These checks
exercise CA/SAN/login enforcement;
they do not verify a real hosted certificate chain or transaction pooler.

## Four browser identities

Author two literal journeys, each run once in desktop Chromium (1440×1000) and
narrow Chromium (390×844), one worker and no retries: a Course journey and a Report
journey. Use the existing
[unpublication fixture](../../tests/e2e/workspace-unpublications.spec.ts) and
[viewport configuration](../../playwright.workspace-unpublications.config.ts) as
references, not an invocation of the old suite. Their seeded Morgan/workspace
assumptions and filesystem artifact snapshots must be replaced.

Each identity signs in through the real portable form, enters its authored
workspace, verifies private data after reload and fresh sign-in, and then:

- Saves/reopens the matching authored Course or Report through its real
  authenticated API/editor, edits and saves revision two, publishes, reads live
  and immutable HTML anonymously, unpublishes with working edits retained, and
  republishes a new UUID. Check saved/current/receipt revisions and hashes, both
  old and live revocation via GET/HEAD/conditional requests, retained private
  object hashes, and no resurrection of revoked immutable URLs. Preserve the
  existing no-analytics, local Course progress, CSP and narrow-layout tripwires.
- Opens the authored Slides editor and uploads an attachment through the actual
  `/api/uploads` UI. Verify its original source remains private, publish an actual
  snapshot, and check committed attachment bytes and public HTML through `/files`,
  `/d` and `/published` using separate anonymous contexts. Publish a protected
  snapshot through the actual password control: a fresh context must see the
  gate, wrong password must fail, correct password must admit the current frame,
  and another fresh context must remain refused. The original source never
  becomes an anonymous attachment; protected current/old artifact URLs must obey
  the existing password policy.

Static Slides fixture creation calls `repository.createDeckFromGeneration` with
authored source directly, through the real selected provider/storage; it does not
simulate a model response. Browser saving/upload/publish/password actions remain
real. Replace local filesystem byte reads with a server-only, bounded helper
using the real selected Storage adapter over owned HTTPS and committed scoped
keys; emit only fixture object keys, sizes and hashes. Never give browser code a
service key or read private objects through a public bucket.

Also retain a real victim library object and an independently authenticated actor.
Attempt to register the known foreign key through the actual asset action and
read it through HTTP; both must refuse access. Include historical colliding team
metadata in this owned fixture, verify private/public file refusal, then restore
only those fixture rows before the ordinary journeys. This closes the metadata
unit tests' separate object/HTTP gate without changing production data.

Warm the actual public/auth routes and the authored workspace/editor routes after
real authenticated setup before asserting browser navigation. Retain strict
request/response/WebSocket/error checks. Observe real response clones and actual
request completion without changing fetch, payloads, abort signals or responses;
drain/detach observers before forced reload/context close. Do not classify a
canceled request as harmless without the existing exact successful-body proof.

## Bounded evidence and cleanup

Use one public Ubuntu 24.04 job with a 20-minute limit, Node 24.21.0, frozen
dependencies/lifecycle-off install and Chromium shell only. Reserve cleanup time
inside that limit; benchmark the explicit setup and four journeys rather than
silently expanding the job or dropping checks. Run focused factory/static checks
and these four browser identities. Keep the prerequisite 90-case receipt tied to
its actual source and execution; do not describe this packet as one fresh
94-case invocation or carry its changed factory inputs as byte-identical. The
provider prerequisite and four browser identities belong to separate sources and
executions.

All certificates, CA material, proxy/app files, browser profiles and reports stay
in one exclusively owned scratch tree. Emit ordinary Playwright JSON plus bounded
boundary evidence, exact identities, original observed stream byte counts/hashes
and explicitly sanitized retained captures. Retrospectively redact all actual
local credentials, tokens and credential URLs; retain no private key, config,
dotenv, raw service key or browser storage state. No AI or hosted/account calls
are permitted. Authored local fixture users are explicit disposable data.

Stop and reap the owned Next/proxy groups, close browsers and probe pools, verify
zero active runtime clients, restore DNS only when its recorded bytes/identity
still match the owned change, and normally stop only the positively owned CLI
project with no backup. Verify Docker containers/networks/volumes, listener ports,
all command EOF/groups/owned descendants and scratch UID/inode/nonce before
deletion. Unknown resources or forced/uncertain cleanup fail the packet; never
terminate outside clients or remove pre-existing data. Preserve failures and all
source/export guards. Actual hosted Supabase/DNS/TLS/pooler, Vercel environment
access/deployment, native application Auth and full AI acceptance remain pending.
