# Supabase migration source-generation probe

Prepared 7 November 2026 as a prerequisite of the
[hosted provider boundary](supabase-hosted-provider.md). This probe generates one
empty migration filename with the actual CLI. It does not test or enable the
application provider, create a database, apply SQL or contact a hosted account.
Standing approval covers this bounded temporary CI; no new approval is requested.

The installed CLI reports 2.117.0, but migration help attempts a telemetry-state
write outside the permitted workspace and fails with EPERM. No local retry or
permission bypass is used. The relevant
[CLI v3 breaking change](https://supabase.com/changelog/supabase-cli-v3) and
[command reference](https://supabase.com/docs/reference/cli/introduction) were
reviewed. Telemetry opt-outs suppress delivery, not all state-file writes; the
[pinned implementation](https://github.com/supabase/cli/blob/v3.0.0/apps/cli/src/telemetry/telemetry-state.layer.ts)
requires an isolated child CLI state directory. The parent environment stays intact.

The [controller](../../scripts/supabase-cli-source-probe.py) runs in one public
Ubuntu 24.04 job capped at ten minutes, with 420 seconds of work and 60 seconds
for cleanup. It pins CLI 3.0.0, the 63,799,117-byte Linux amd64 archive SHA256
`eeb61edcd59a4735fcb5e58596574f25d03d420efca779f43ddb307e1cc5c754`
and the official checksum file's bytes/hash. Only the expected ELF member is
extracted into owned scratch. Help/version discovery precedes
`migration new intelligent_visualization_hosted`; the actual generated relative
path and empty contents are retained. No timestamp is invented.

Seven commands have bounded original streams and EOF/reaping/process-group
checks. Four full source guards bind the immutable checkout. PID/start identity,
owned scratch identity, no residual/uncertain process and scratch removal are
required for success. The CLI's child state, cache and project paths are isolated.
Any forced/incomplete cleanup fails and preserves uncertain scratch rather than
claiming success. No OS-level zero-network claim is made.

Root pins a reviewed source into the inactive
[workflow example](supabase-cli-source-probe.workflow.yml.example) before creating
the exact QA branch. Other in-progress application changes remain outside that
frozen probe commit. Permanent CI is retained; the temporary workflow is disabled
and retired after the result. This is source generation only, not app testing,
schema acceptance, Supabase service validation or deployment proof.

Host Storage Guard measured 26.6 GiB against 34.0 required; no local installation,
build, server, browser or database is permitted. The connected organization shows
two active projects, but no capacity/billing or consolidation decision is inferred
from that inventory. No paid plan, new account, project, role, settings or provider
configuration is changed by this probe. The existing Vercel environment403 is not
retried.
