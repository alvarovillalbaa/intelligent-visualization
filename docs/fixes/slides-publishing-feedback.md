# Slides publishing feedback

Source change, 7 November 2026; partial runtime observations, full acceptance pending.

The [editor](../../components/slides/deck-editor-client.tsx) previously left its
manual-edits message visible after publishing. It now announces progress, then
names the accepted version using the returned label only after the
[publish action](../../app/actions/decks.ts) resolves. The activity paragraph is
a polite live status.

Rejection can occur after the transaction commits. The editor therefore reports
an uncertain outcome, preserves the local draft and inputs, and advises checking
Published variants before retrying. It does not retry, refresh or navigate.
Inputs remain editable during publication; success names that submitted version
without claiming later local edits were published.

TSX syntax, whitespace and independent source review passed. No local runtime
check ran. Application attempt 7 excluded this change. Later
[control 8](../results/2026/11-07/supabase-application-attempt-8.md), at `3635084`,
observed the returned-label success message in one ordinary completed publication
and three post-cancellation diagnostics. All four complete journeys remained
failed. The uncertain-rejection branch has source review only. These observations
do not fix the response-abort issue or establish hosted/production acceptance.

[Production control 10](../results/2026/11-07/supabase-application-attempt-10.md)
also observed the direct returned-label acknowledgement in all four identities,
15–18 milliseconds after each first publication's fatal cancellation. Matching
fresh UI/SQL/Storage diagnostics stayed inside the original deadline. Action
resolution still does not establish network EOF or a complete journey.
