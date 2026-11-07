# Slides publishing feedback

Source change, 7 November 2026; runtime verification pending.

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
check ran. Application attempt 7 tests the earlier `e0cf4b9` source and cannot
verify this feedback change. This is separate from the unresolved response-abort
investigation and establishes no hosted or production acceptance.
