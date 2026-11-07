# Share links follow publication eligibility

Source change, 7 November 2026; runtime verification pending.

The workspace previously offered a Public link for preview decks, and the editor
offered unsigned artifact links for preview or historically protected versions.
The public routes refuse those requests. Production router prefetch can also
request those destinations before a click.

The workspace now uses the existing current-public-version check. The server
editor page supplies sharing fields only for a current publication and derives
eligible unsigned artifact paths using the existing password policy. The client
renders those documents as ordinary anchors, with an own-property check on the
server-provided map. Drafts instead say to publish a version before sharing.

No route, authorization policy, signed capability or publication mutation changed.
Existing protected-current owner links retain their authority; unavailable preview
links are no longer issued. Source review, TSX parsing and whitespace checks passed.
The upcoming production-mode CI packet must verify the behavior; earlier runs do not.
