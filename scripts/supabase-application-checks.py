#!/usr/bin/env python3
"""Four owned application journeys; inactive until the separate provider receipt is pinned."""
import base64
import gzip
import hashlib
import http.client
import sys
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import socket
import stat
import subprocess
import tarfile
import tempfile
import time
import tomllib
import traceback
from urllib.parse import urlsplit

repo, source = Path.cwd(), os.environ["SOURCE_COMMIT"]
BRANCH = "qa/supabase-application-current-chromium-20261110-1"
LOCK_SHA = "b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59"
ASSET = "supabase_3.0.0_linux_amd64.tar.gz"
ARCHIVE_SHA = "eeb61edcd59a4735fcb5e58596574f25d03d420efca779f43ddb307e1cc5c754"
CHECKSUM_SHA = "23763f31f1d3251c71cad4fd27577303f306514e2b99da91427a619d1800301f"
BASE = "https://github.com/supabase/cli/releases/download/v3.0.0/"
MIGRATION = "supabase/migrations/20261107002755_intelligent_visualization_hosted.sql"
ADMIN = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
DB_HOST = "db.abcdefghijklmnopqrst.supabase.co"
API_HOST = "abcdefghijklmnopqrst.supabase.co"
RUNTIME = "postgresql://iv_runtime:authored-ci-runtime@" + DB_HOST + ":5432/postgres"
APP_ORIGIN = "http://localhost:3100"
STORAGE_ORIGIN = "https://" + API_HOST + ":54443"
PREREQUISITE_PATH = "docs/results/2026/11-07/supabase-provider-attempt-8.json"
PREREQUISITE_SOURCE = "4da1844f22a332aad8bd827a026c3a806b4a308f"
PREREQUISITE_SHA256 = "24e75dfa95b776210d369129d2a592f231e7dca8c78741910f1ab18e5ab74441"
PREREQUISITE_BYTES = 369374
APPLICATION_PRIOR_PATH = "docs/results/2026/11-07/supabase-application-attempt-1.json"
APPLICATION_PRIOR_SOURCE = "0d9ebd2f6c4bf4d7271d91443b015ed9cfd9edcb"
APPLICATION_PRIOR_SHA256 = "b72f64992213cdc3277ba52c916418d6266bd6871727545a66b3e37b24d54806"
APPLICATION_PRIOR_BYTES = 188352
APPLICATION_SECOND_PATH = "docs/results/2026/11-07/supabase-application-attempt-2.json"
APPLICATION_SECOND_SOURCE = "380d56020fd13977d35a61a78a7ee3a93f98dc13"
APPLICATION_SECOND_SHA256 = "eb238d75543631f369f3849730439ca708e940898c5369e38f70c817cc33e326"
APPLICATION_SECOND_BYTES = 487084
APPLICATION_THIRD_PATH = "docs/results/2026/11-07/supabase-application-attempt-3.json"
APPLICATION_THIRD_SOURCE = "22ff1a18d6d5c81dca39ff77279dbaca0496ab4c"
APPLICATION_THIRD_SHA256 = "b37fc6d143e6e8600206be36307e34e2d0d07591ca4ef48a643640f9e289d310"
APPLICATION_THIRD_BYTES = 537338
APPLICATION_FOURTH_PATH = "docs/results/2026/11-07/supabase-application-attempt-4.json"
APPLICATION_FOURTH_SOURCE = "15916d462e966679fd17e3a4a46c3742d590f354"
APPLICATION_FOURTH_SHA256 = "3750fc2f07db1f6df19b454543c81af8b4ab6413035a0b0447d45083a7644acd"
APPLICATION_FOURTH_BYTES = 611577
APPLICATION_FIFTH_PATH = "docs/results/2026/11-07/supabase-application-attempt-5.json"
APPLICATION_FIFTH_SOURCE = "edb2a5df9820248b4263285608ef7b60a7365194"
APPLICATION_FIFTH_SHA256 = "605c4ee76b2fe4d745ea4bb7d97b69cc7307aa1accc97cd1ed55b93617254805"
APPLICATION_FIFTH_BYTES = 604336
APPLICATION_SIXTH_PATH = "docs/results/2026/11-07/supabase-application-attempt-6.json"
APPLICATION_SIXTH_SOURCE = "f7d39323af22a7eada88b4bd5bfd7d6c116b9b74"
APPLICATION_SIXTH_SHA256 = "cb0171a830e112020da97c21f0a27990404f2dd9a86f93407415f18805cd8f1c"
APPLICATION_SIXTH_BYTES = 643901
APPLICATION_SEVENTH_PATH = "docs/results/2026/11-07/supabase-application-attempt-7.json"
APPLICATION_SEVENTH_SOURCE = "e0cf4b9ea529b1d4d3a4fac9194e3521c2f72506"
APPLICATION_SEVENTH_SHA256 = "f6de7dbe156c28915b3dfe0ffd681d9df1042c4a2ee799c8c22438ec827a16f2"
APPLICATION_SEVENTH_BYTES = 693800
APPLICATION_EIGHTH_PATH = "docs/results/2026/11-07/supabase-application-attempt-8.json"
APPLICATION_EIGHTH_SOURCE = "3635084b0b35d96d97470e2f3c103e106e583534"
APPLICATION_EIGHTH_SHA256 = "17de177b639348e28a213a13bc76f245e3675aa186c1b3103ad5a1efb4b8c2f4"
APPLICATION_EIGHTH_BYTES = 706477
APPLICATION_NINTH_PATH = "docs/results/2026/11-07/supabase-application-attempt-9.json"
APPLICATION_NINTH_SOURCE = "0caf57b9f623d08bef1b8d919900ac4f2ccfa8cb"
APPLICATION_NINTH_SHA256 = "f68b997132c73415d209993c806b8c512a5991dcae379b5788213fae7e215dab"
APPLICATION_NINTH_BYTES = 379235
APPLICATION_TENTH_PATH = "docs/results/2026/11-07/supabase-application-attempt-10.json"
APPLICATION_TENTH_SOURCE = "026f25ef2d621ad74b0044c4f400b4cf535a4988"
APPLICATION_TENTH_SHA256 = "5b1c3d3e2ac431d51fa0342f64c0480af5cedc7b2919764f790149382d7c47fe"
APPLICATION_TENTH_BYTES = 741962
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert os.environ.get("CI") == os.environ.get("IV_SUPABASE_APPLICATION_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == "alvarovillalbaa/intelligent-visualization"
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + BRANCH
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
assert event["ref_type"] == "branch" and event["ref"] == BRANCH and event["repository"]["private"] is False
assert os.uname().sysname == "Linux" and os.uname().machine == "x86_64"
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
work_end, cleanup_end, interruption, MAX = time.monotonic() + 1020, None, None, 4_000_000


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=repo)


def vector():
    head, index = {}, {}
    for entry in git("ls-tree", "-rz", "--full-tree", "HEAD").split(b"\0"):
        if not entry: continue
        metadata, raw_name = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split(); name = raw_name.decode()
        assert kind == "blob" and mode in ["100644", "100755", "120000"]
        file = repo / name; info = file.lstat()
        assert file.is_symlink() if mode == "120000" else stat.S_ISREG(info.st_mode) and not file.is_symlink()
        data = os.fsencode(os.readlink(file)) if mode == "120000" else file.read_bytes()
        assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == blob
        if mode != "120000": assert bool(info.st_mode & 0o111) == (mode == "100755")
        head[name] = {"mode": mode, "blob": blob, "bytes": len(data), "sha256": sha(data)}
    for entry in git("ls-files", "--stage", "-z").split(b"\0"):
        if not entry: continue
        metadata, name = entry.split(b"\t", 1); mode, blob, stage = metadata.decode().split()
        assert stage == "0"; index[name.decode()] = {"mode": mode, "blob": blob}
    assert index == {name: {"mode": row["mode"], "blob": row["blob"]} for name, row in head.items()}
    assert not git("status", "--porcelain", "--untracked-files=all", "--ignored")
    return head


before = vector()
report = {"schemaVersion": 1, "sourceCommit": source, "startedAt": time.time(), "commands": [], "sourceFiles": before, "sourceGuards": [],
    "scope": "Four fresh desktop/narrow Course/Report plus legacy Slides browser identities through actual selected factories, owned CA/DNS PostgreSQL TLS and real HTTPS Storage proxy. No provider injection, fetch mapping, TLS disabling, model, hosted account or deployment.",
    "capturePolicy": "Original streams remain only in controller memory. Retained captures/JSON/errors are byte-preservingly sanitized with actual local status keys and private actor passwords. Original observed byte/SHA metadata is not independently replayable original evidence."}
assert re.fullmatch(r"[0-9a-f]{40}", PREREQUISITE_SOURCE) and re.fullmatch(r"[0-9a-f]{64}", PREREQUISITE_SHA256) and PREREQUISITE_BYTES > 0, "The passing 90-case prerequisite must be reviewed and pinned"
prior_bytes = (repo / PREREQUISITE_PATH).read_bytes()
assert len(prior_bytes) == PREREQUISITE_BYTES and sha(prior_bytes) == PREREQUISITE_SHA256
prior = json.loads(prior_bytes)
assert prior["sourceCommit"] == PREREQUISITE_SOURCE and prior["passed"] is True and prior["freshCasesPassed"] == 90
protected = prior["sourceExport"]["inputs"]
allowed_factory_changes = {"lib/persistence/factory.ts", "lib/storage/factory.ts"}
public_link_changes = {"app/app/workspaces/[workspaceSlug]/page.tsx", "app/app/workspaces/[workspaceSlug]/decks/[deckId]/page.tsx"}
allowed_application_changes = {"components/slides/deck-editor-client.tsx", "app/actions/decks.ts"} | public_link_changes
allowed_documentation_changes = {"packages/provider-supabase/README.md"}
reviewed_changes = allowed_factory_changes | allowed_application_changes | allowed_documentation_changes
assert reviewed_changes <= protected.keys() and reviewed_changes <= before.keys()
assert all(before[name]["mode"] == protected[name]["mode"] == "100644" for name in reviewed_changes)
assert all(before.get(name) == row for name, row in protected.items() if name not in reviewed_changes), "Accepted provider inputs changed outside the exact reviewed factories/Slides-client/actions/documentation paths"
report["providerPrerequisite"] = {"receipt": PREREQUISITE_PATH, "bytes": len(prior_bytes), "sha256": sha(prior_bytes), "sourceCommit": PREREQUISITE_SOURCE,
    "passed": 90, "executedThisAttempt": False, "limit": "Separate accepted provider receipt; this is four fresh application journeys, not a fresh combined 94-case invocation.",
    "protectedInputs": len(protected), "preservedExactInputs": len(protected) - len(reviewed_changes),
    "allowedFactoryCodeInputs": sorted(allowed_factory_changes), "allowedApplicationCodeInputs": sorted(allowed_application_changes), "allowedDocumentationOnlyInputs": sorted(allowed_documentation_changes),
    "reviewedInputs": [{"path": name, "accepted": protected[name], "current": before[name], "reason": "Reviewed real factory selection/health integration" if name in allowed_factory_changes else "Publish/add-asset actions resolve and validate the actual authorized deck workspace before mutation and revalidate that editor path" if name == "app/actions/decks.ts" else "Three client refresh removals after revalidating Slides ServerActions; race cause remains unproven" if name in allowed_application_changes else "Documentation-only correction of selection and disposable-service acceptance status; no runtime code"} for name in sorted(reviewed_changes)]}
application_prior_bytes = (repo / APPLICATION_PRIOR_PATH).read_bytes()
assert len(application_prior_bytes) == APPLICATION_PRIOR_BYTES and sha(application_prior_bytes) == APPLICATION_PRIOR_SHA256
application_prior = json.loads(application_prior_bytes)
assert application_prior["sourceCommit"] == APPLICATION_PRIOR_SOURCE and application_prior["passed"] is False
assert application_prior["providerCasesExecutedThisAttempt"] == 0 and not application_prior.get("freshBrowserCasesPassed")
assert len(application_prior["commands"]) == 4 and [row["exitCode"] for row in application_prior["commands"]] == [0, 0, 0, 2]
application_protected = application_prior["sourceExport"]["inputs"]
application_changes = {"tests/e2e/supabase-application.spec.ts", "components/slides/deck-editor-client.tsx", "app/actions/decks.ts", "scripts/supabase-application-fixture.ts", "playwright.supabase-application.config.ts"} | public_link_changes
application_documentation_changes = {"packages/provider-supabase/README.md"}
application_reviewed_changes = application_changes | application_documentation_changes
assert len(application_protected) == 286 and application_reviewed_changes <= application_protected.keys() and application_reviewed_changes <= before.keys()
assert all(application_protected[name]["mode"] == before[name]["mode"] == "100644" for name in application_reviewed_changes)
assert all(before.get(name) == row for name, row in application_protected.items() if name not in application_reviewed_changes), "First application attempt inputs changed outside the exact runtime paths and separately reviewed documentation path"
report["previousApplicationAttempts"] = [{"receipt": APPLICATION_PRIOR_PATH, "bytes": len(application_prior_bytes), "sha256": sha(application_prior_bytes),
    "sourceCommit": APPLICATION_PRIOR_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 0,
    "failurePhase": "Semantic TypeScript before CLI setup, TLS probes, Next or browsers", "carriedCases": 0,
    "protectedInputs": 286, "preservedExactInputs": 278,
    "reviewedInputs": [{"path": name, "previous": application_protected[name], "current": before[name],
        "reason": "Cumulative browser-spec corrections/exact-request diagnostics and ordinary navigation to the authored secondary workspace; assertions and limits retained" if name.endswith(".spec.ts") else "Report-desktop actor uses an authored same-team secondary workspace while its primary workspace remains hq" if name == "scripts/supabase-application-fixture.ts" else "Resolve/validate actual authorized deck workspace before publish/add-asset mutation, then revalidate its editor path" if name == "app/actions/decks.ts" else "Three client refresh removals after revalidating Slides ServerActions; cause unproven"} for name in sorted(application_changes)]}]
application_second_bytes = (repo / APPLICATION_SECOND_PATH).read_bytes()
assert len(application_second_bytes) == APPLICATION_SECOND_BYTES and sha(application_second_bytes) == APPLICATION_SECOND_SHA256
application_second = json.loads(application_second_bytes)
assert application_second["sourceCommit"] == APPLICATION_SECOND_SOURCE and application_second["passed"] is False
assert application_second["providerCasesExecutedThisAttempt"] == 0 and not application_second.get("freshBrowserCasesPassed")
assert application_second["playwright"]["stats"]["expected"] == 0 and application_second["playwright"]["stats"]["unexpected"] == 4
assert application_second["playwright"]["stats"]["skipped"] == application_second["playwright"]["stats"]["flaky"] == 0
assert len(application_second["nextTLSWindows"]) == 1
second_protected = application_second["sourceExport"]["inputs"]
assert len(second_protected) == 286 and application_second["sourceExport"]["bytes"] == 2243744
assert application_reviewed_changes <= second_protected.keys() and all(second_protected[name]["mode"] == before[name]["mode"] == "100644" for name in application_reviewed_changes)
assert all(before.get(name) == row for name, row in second_protected.items() if name not in application_reviewed_changes), "Second application attempt inputs changed outside the exact runtime paths and separately reviewed documentation path"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_SECOND_PATH, "bytes": len(application_second_bytes), "sha256": sha(application_second_bytes),
    "sourceCommit": APPLICATION_SECOND_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 4, "acceptedBrowserCases": 0,
    "failurePhase": "All four journeys stopped at publish-2 on strict helper stderr; unproven navigation cancellations also remain fatal",
    "unprovenNavigationCancellations": [1, 2, 2, 2], "contextsEach": {"created": 2, "closed": 2}, "nextTLSWindowsObserved": 1, "carriedCases": 0,
    "protectedInputs": 286, "preservedExactInputs": 278,
    "reviewedInputs": [{"path": name, "previous": second_protected[name], "current": before[name],
        "reason": "Helper child environment removes only FORCE_COLOR; exact-request diagnostics and ordinary secondary-workspace navigation added without failure waivers" if name.endswith(".spec.ts") else "Report-desktop actor uses an authored same-team secondary workspace while its primary workspace remains hq" if name == "scripts/supabase-application-fixture.ts" else "Resolve/validate actual authorized deck workspace before publish/add-asset mutation, then revalidate its editor path" if name == "app/actions/decks.ts" else "Three client refresh removals after revalidating Slides ServerActions; cause unproven"} for name in sorted(application_changes)]})
application_third_bytes = (repo / APPLICATION_THIRD_PATH).read_bytes()
assert len(application_third_bytes) == APPLICATION_THIRD_BYTES and sha(application_third_bytes) == APPLICATION_THIRD_SHA256
application_third = json.loads(application_third_bytes)
assert application_third["sourceCommit"] == APPLICATION_THIRD_SOURCE and application_third["passed"] is False
assert application_third["providerCasesExecutedThisAttempt"] == 0 and not application_third.get("freshBrowserCasesPassed")
assert application_third["playwright"]["stats"]["expected"] == 0 and application_third["playwright"]["stats"]["unexpected"] == 3
assert application_third["playwright"]["stats"]["skipped"] == 1 and application_third["playwright"]["stats"]["flaky"] == 0
third_protected = application_third["sourceExport"]["inputs"]
assert len(third_protected) == 286 and application_reviewed_changes <= third_protected.keys()
assert all(third_protected[name]["mode"] == before[name]["mode"] == "100644" for name in application_reviewed_changes)
assert all(before.get(name) == row for name, row in third_protected.items() if name not in application_reviewed_changes), "Third application attempt inputs changed outside the exact runtime paths and separately reviewed documentation path"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_THIRD_PATH, "bytes": len(application_third_bytes), "sha256": sha(application_third_bytes),
    "sourceCommit": APPLICATION_THIRD_SOURCE, "passed": False, "providerCasesExecuted": 0, "acceptedBrowserCases": 0, "carriedCases": 0,
    "browserReport": {"expected": 0, "unexpected": 3, "skipped": 1, "timedOut": 3},
    "failurePhase": "Three reported journeys timed out at slides-publish-1; fourth reported skipped at global timeout, although server-side work occurred",
    "fourthFinalizedBoundaryPresent": False, "browserFixtureCleanup": "failed", "outerOwnedCleanup": "passed",
    "unprovenRequestFailures": [3, 5, 8], "protectedInputs": 286, "preservedExactInputs": 278,
    "reviewedInputs": [{"path": name, "previous": third_protected[name], "current": before[name],
        "reason": "Exact matched-request identity/bounded completion diagnostics and ordinary secondary-workspace navigation; failures remain fatal" if name.endswith(".spec.ts") else "Report-desktop actor uses an authored same-team secondary workspace while its primary workspace remains hq" if name == "scripts/supabase-application-fixture.ts" else "Resolve/validate actual authorized deck workspace before publish/add-asset mutation, then revalidate its editor path" if name == "app/actions/decks.ts" else "Three client refresh removals after revalidating Slides ServerActions; race cause remains inference pending actual verification"} for name in sorted(application_changes)]})
application_fourth_bytes = (repo / APPLICATION_FOURTH_PATH).read_bytes()
assert len(application_fourth_bytes) == APPLICATION_FOURTH_BYTES and sha(application_fourth_bytes) == APPLICATION_FOURTH_SHA256
application_fourth = json.loads(application_fourth_bytes)
assert application_fourth["sourceCommit"] == APPLICATION_FOURTH_SOURCE and application_fourth["passed"] is False
assert application_fourth["providerCasesExecutedThisAttempt"] == 0 and not application_fourth.get("freshBrowserCasesPassed")
assert application_fourth["playwright"]["stats"]["expected"] == 0 and application_fourth["playwright"]["stats"]["unexpected"] == 4
assert application_fourth["playwright"]["stats"]["skipped"] == application_fourth["playwright"]["stats"]["flaky"] == 0
fourth_protected = application_fourth["sourceExport"]["inputs"]
fourth_changes = {"tests/e2e/supabase-application.spec.ts", "components/slides/deck-editor-client.tsx", "scripts/supabase-application-fixture.ts", "playwright.supabase-application.config.ts"} | public_link_changes
fourth_reviewed_changes = fourth_changes | application_documentation_changes
assert len(fourth_protected) == 286 and fourth_reviewed_changes <= fourth_protected.keys() and fourth_reviewed_changes <= before.keys()
assert all(fourth_protected[name]["mode"] == before[name]["mode"] == "100644" for name in fourth_reviewed_changes)
assert all(before.get(name) == row for name, row in fourth_protected.items() if name not in fourth_reviewed_changes), "Fourth application attempt inputs changed outside the exact UI/spec/snapshot-helper paths and separately reviewed documentation path"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_FOURTH_PATH, "bytes": len(application_fourth_bytes), "sha256": sha(application_fourth_bytes),
    "sourceCommit": APPLICATION_FOURTH_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 4, "acceptedBrowserCases": 0, "carriedCases": 0,
    "browserReport": {"expected": 0, "unexpected": 4, "skipped": 0},
    "failurePhase": "All four failed during slides-publish-1 prepare: the unnamed textbox locator also matched the password input, before any matched publication request",
    "slidesPublicationStreamDiagnosed": False, "diagnosticRows": {"count": 4, "phase": "prepare", "request": None, "response": None, "finishedAt": None, "failedAt": None, "failure": None, "finishedResolvedAt": None,
        "listenersRemoved": False, "timerCleared": False, "falseFlagsAreVacuousBeforeListenerCreation": True},
    "secondaryReportWorkspaceObserved": "secondary-reports", "unprovenRequestFailures": [5, 5, 4, 4], "protectedInputs": 286, "preservedExactInputs": 279,
    "reviewedInputs": [{"path": name, "previous": fourth_protected[name], "current": before[name],
        "reason": "Exact named version field and native-reader/post-failure UI diagnostics; original failures and deadlines retained" if name.endswith(".spec.ts") else "Snapshot-only hashed label/source/database-HTML metadata; existing fields and all fixture setup/guards retained" if name == "scripts/supabase-application-fixture.ts" else "Version input gains the explicit accessible name Version label; no behavior or action change"} for name in sorted(fourth_changes)]})
for previous_attempt, previous_inputs in zip(report["previousApplicationAttempts"], [application_protected, second_protected, third_protected, fourth_protected], strict=True):
    previous_attempt["allowedRuntimeInputs"] = [row["path"] for row in previous_attempt["reviewedInputs"]]
    previous_attempt["allowedDocumentationOnlyInputs"] = sorted(application_documentation_changes)
    for name in sorted(application_documentation_changes):
        previous_attempt["reviewedInputs"].append({"path": name, "previous": previous_inputs[name], "current": before[name],
            "reason": "Documentation-only status correction linking failed application evidence; no runtime allowance"})
application_fifth_bytes = (repo / APPLICATION_FIFTH_PATH).read_bytes()
assert len(application_fifth_bytes) == APPLICATION_FIFTH_BYTES and sha(application_fifth_bytes) == APPLICATION_FIFTH_SHA256
application_fifth = json.loads(application_fifth_bytes)
assert application_fifth["sourceCommit"] == APPLICATION_FIFTH_SOURCE and application_fifth["passed"] is False
assert application_fifth["providerCasesExecutedThisAttempt"] == 0 and not application_fifth.get("freshBrowserCasesPassed")
assert application_fifth["playwright"]["stats"]["expected"] == 0 and application_fifth["playwright"]["stats"]["unexpected"] == 4
assert application_fifth["playwright"]["stats"]["skipped"] == application_fifth["playwright"]["stats"]["flaky"] == 0
fifth_protected = application_fifth["sourceExport"]["inputs"]
fifth_changes = {"tests/e2e/supabase-application.spec.ts", "scripts/supabase-application-fixture.ts", "components/slides/deck-editor-client.tsx", "playwright.supabase-application.config.ts"} | public_link_changes
fifth_reviewed_changes = fifth_changes | application_documentation_changes
assert len(fifth_protected) == 286 and fifth_reviewed_changes <= fifth_protected.keys() and fifth_reviewed_changes <= before.keys()
assert all(fifth_protected[name]["mode"] == before[name]["mode"] == "100644" for name in fifth_reviewed_changes)
assert all(before.get(name) == row for name, row in fifth_protected.items() if name not in fifth_reviewed_changes), "Fifth application attempt inputs changed outside the exact diagnostic spec/snapshot helper/feedback client and separately reviewed documentation path"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_FIFTH_PATH, "bytes": len(application_fifth_bytes), "sha256": sha(application_fifth_bytes),
    "sourceCommit": APPLICATION_FIFTH_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 4, "acceptedBrowserCases": 0, "carriedCases": 0,
    "browserReport": {"expected": 0, "unexpected": 4, "skipped": 0},
    "failurePhase": "Four exact Slides publication requests received 200 text/x-component then failed with net::ERR_ABORTED at response-finished; actual React-reader EOF/cancel was not observed",
    "partialControl": {"case": "course-narrow", "publicationIndex": 1, "responseFinishedReturnedNull": True, "privateSlidesSnapshotPresent": True, "laterPublicationFailed": True, "fullJourneyAccepted": False},
    "protectedInputs": 286, "preservedExactInputs": 279, "allowedRuntimeInputs": sorted(fifth_changes), "allowedDocumentationOnlyInputs": sorted(application_documentation_changes),
    "reviewedInputs": [{"path": name, "previous": fifth_protected[name], "current": before[name],
        "reason": "Documentation-only status correction linking failed application evidence; no runtime allowance" if name in application_documentation_changes else "Snapshot-only hashed label/source/database-HTML metadata; existing fields and all fixture setup/guards retained" if name == "scripts/supabase-application-fixture.ts" else "Client activity announces Publishing, awaited returned-label success or generic uncertainty without editing inputs, authority, requests or navigation" if name == "components/slides/deck-editor-client.tsx" else "Actual-reader/post-failure outcome diagnostics plus URL-handler-bypass control; all original completion and failure gates retained"} for name in sorted(fifth_reviewed_changes)]})
application_sixth_bytes = (repo / APPLICATION_SIXTH_PATH).read_bytes()
assert len(application_sixth_bytes) == APPLICATION_SIXTH_BYTES and sha(application_sixth_bytes) == APPLICATION_SIXTH_SHA256
application_sixth = json.loads(application_sixth_bytes)
assert application_sixth["sourceCommit"] == APPLICATION_SIXTH_SOURCE and application_sixth["passed"] is False
assert application_sixth["providerCasesExecutedThisAttempt"] == 0 and not application_sixth.get("freshBrowserCasesPassed")
assert application_sixth["playwright"]["stats"]["expected"] == 0 and application_sixth["playwright"]["stats"]["unexpected"] == 4
assert application_sixth["playwright"]["stats"]["skipped"] == application_sixth["playwright"]["stats"]["flaky"] == 0
sixth_protected = application_sixth["sourceExport"]["inputs"]
sixth_changes = {"tests/e2e/supabase-application.spec.ts", "scripts/supabase-application-fixture.ts", "components/slides/deck-editor-client.tsx", "playwright.supabase-application.config.ts"} | public_link_changes
assert len(sixth_protected) == 286 and sixth_changes <= sixth_protected.keys() and sixth_changes <= before.keys()
assert all(sixth_protected[name]["mode"] == before[name]["mode"] == "100644" for name in sixth_changes)
assert all(before.get(name) == row for name, row in sixth_protected.items() if name not in sixth_changes), "Sixth application attempt inputs changed outside the exact diagnostic spec/snapshot helper/feedback client; its documentation must also remain exact"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_SIXTH_PATH, "bytes": len(application_sixth_bytes), "sha256": sha(application_sixth_bytes),
    "sourceCommit": APPLICATION_SIXTH_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 4, "acceptedBrowserCases": 0, "carriedCases": 0,
    "browserReport": {"expected": 0, "unexpected": 4, "skipped": 0},
    "failurePhase": "All four exact Slides publication requests failed with net::ERR_ABORTED after correlated actual-reader native done; no post-failure UI or snapshot acknowledgement was collected",
    "nativeDoneProvesNetworkEOF": False, "semanticActionCompletionProven": False,
    "protectedInputs": 286, "preservedExactInputs": 280, "allowedRuntimeInputs": sorted(sixth_changes), "allowedDocumentationOnlyInputs": [],
    "reviewedInputs": [{"path": name, "previous": sixth_protected[name], "current": before[name],
        "reason": "Snapshot-only hashed label/source/database-HTML metadata; existing fields and all fixture setup/guards retained" if name == "scripts/supabase-application-fixture.ts" else "Client activity announces Publishing, awaited returned-label success or generic uncertainty without editing inputs, authority, requests or navigation" if name == "components/slides/deck-editor-client.tsx" else "Bounded post-failure outcome diagnostics and URL-handler-bypass control; all original completion and failure gates retained"} for name in sorted(sixth_changes)]})
application_seventh_bytes = (repo / APPLICATION_SEVENTH_PATH).read_bytes()
assert len(application_seventh_bytes) == APPLICATION_SEVENTH_BYTES and sha(application_seventh_bytes) == APPLICATION_SEVENTH_SHA256
application_seventh = json.loads(application_seventh_bytes)
assert application_seventh["sourceCommit"] == APPLICATION_SEVENTH_SOURCE and application_seventh["passed"] is False
assert application_seventh["providerCasesExecutedThisAttempt"] == 0 and not application_seventh.get("freshBrowserCasesPassed")
assert application_seventh["playwright"]["stats"]["expected"] == 0 and application_seventh["playwright"]["stats"]["unexpected"] == 4
assert application_seventh["playwright"]["stats"]["skipped"] == application_seventh["playwright"]["stats"]["flaky"] == 0
seventh_protected = application_seventh["sourceExport"]["inputs"]
seventh_changes = {"tests/e2e/supabase-application.spec.ts", "components/slides/deck-editor-client.tsx", "scripts/supabase-application-fixture.ts", "playwright.supabase-application.config.ts"} | public_link_changes
assert len(seventh_protected) == 286 and seventh_changes <= seventh_protected.keys() and seventh_changes <= before.keys()
assert all(seventh_protected[name]["mode"] == before[name]["mode"] == "100644" for name in seventh_changes)
assert all(before.get(name) == row for name, row in seventh_protected.items() if name not in seventh_changes), "Seventh application attempt inputs changed outside the exact production spec/client/page/origin/fixture paths; documentation must remain exact"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_SEVENTH_PATH, "bytes": len(application_seventh_bytes), "sha256": sha(application_seventh_bytes),
    "sourceCommit": APPLICATION_SEVENTH_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 4, "acceptedBrowserCases": 0, "carriedCases": 0,
    "browserReport": {"expected": 0, "unexpected": 4, "skipped": 0},
    "failurePhase": "All four exact Slides requests remained fatal despite bounded post-failure fresh UI/current version and SQL/Storage acknowledgement; no complete journey was accepted",
    "postFailureAcknowledgementsObserved": 4, "nativeDoneProvesNetworkEOF": False, "transportCauseProven": False,
    "protectedInputs": 286, "preservedExactInputs": 280, "allowedRuntimeInputs": sorted(seventh_changes), "allowedDocumentationOnlyInputs": [],
    "reviewedInputs": [{"path": name, "previous": seventh_protected[name], "current": before[name],
        "reason": "Client activity announces Publishing, awaited returned-label success or generic uncertainty without editing inputs, authority, requests or navigation" if name == "components/slides/deck-editor-client.tsx" else "URL-handler-bypass control with identical passive request validation, bounded passive CDP terminal metadata, exact owned HMR grammar and feedback acknowledgement; strict failures retained"} for name in sorted(seventh_changes)]})
for previous_attempt in report["previousApplicationAttempts"][:4]:
    for reviewed_input in previous_attempt["reviewedInputs"]:
        if reviewed_input["path"] == "components/slides/deck-editor-client.tsx":
            reviewed_input["reason"] += "; current client also announces Publishing, awaited returned-label success or generic uncertainty without changing inputs, authority or requests"
application_eighth_bytes = (repo / APPLICATION_EIGHTH_PATH).read_bytes()
assert len(application_eighth_bytes) == APPLICATION_EIGHTH_BYTES and sha(application_eighth_bytes) == APPLICATION_EIGHTH_SHA256
application_eighth = json.loads(application_eighth_bytes)
assert application_eighth["sourceCommit"] == APPLICATION_EIGHTH_SOURCE and application_eighth["passed"] is False
assert application_eighth["providerCasesExecutedThisAttempt"] == 0 and not application_eighth.get("freshBrowserCasesPassed")
assert application_eighth["playwright"]["stats"]["expected"] == 0 and application_eighth["playwright"]["stats"]["unexpected"] == 4
assert application_eighth["playwright"]["stats"]["skipped"] == application_eighth["playwright"]["stats"]["flaky"] == 0
eighth_protected = application_eighth["sourceExport"]["inputs"]
eighth_changes = {"tests/e2e/supabase-application.spec.ts", "scripts/supabase-application-fixture.ts", "playwright.supabase-application.config.ts", "components/slides/deck-editor-client.tsx"} | public_link_changes
assert len(eighth_protected) == 286 and eighth_changes <= eighth_protected.keys() and eighth_changes <= before.keys()
assert all(eighth_protected[name]["mode"] == before[name]["mode"] == "100644" for name in eighth_changes)
assert all(before.get(name) == row for name, row in eighth_protected.items() if name not in eighth_changes), "Eighth application attempt inputs changed outside the exact production spec/client/page/origin/initial-version metadata paths"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_EIGHTH_PATH, "bytes": len(application_eighth_bytes), "sha256": sha(application_eighth_bytes),
    "sourceCommit": APPLICATION_EIGHTH_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 4, "acceptedBrowserCases": 0, "carriedCases": 0,
    "browserReport": {"expected": 0, "unexpected": 4, "skipped": 0}, "transportCauseProven": False,
    "failurePhase": "The route-handler-bypass control did not remove fatal Slides request aborts; no complete journey was accepted",
    "protectedInputs": 286, "preservedExactInputs": 280, "allowedRuntimeInputs": sorted(eighth_changes), "allowedDocumentationOnlyInputs": [],
    "reviewedInputs": [{"path": name, "previous": eighth_protected[name], "current": before[name],
        "reason": "Exact localhost origin for unchanged Secure-cookie policy; no factory/TLS/fixture-authority change" if not name.endswith(".spec.ts") else "Explicit production-runtime control: finite own prefetch reads, passive body-hash request correlation without dev headers, unchanged strict completion/failure gates"} for name in sorted(eighth_changes)]})
for previous_attempt in report["previousApplicationAttempts"]:
    for reviewed_input in previous_attempt["reviewedInputs"]:
        if reviewed_input["path"] in {"scripts/supabase-application-fixture.ts", "playwright.supabase-application.config.ts"}:
            reviewed_input["reason"] = "Exact localhost origin; production config keeps all four identities and timeouts unchanged" if reviewed_input["path"].endswith(".config.ts") else "Authored fixture/snapshot metadata with localhost origin and retained initial-version ID proof; setup, scope, TLS and cleanup unchanged"
        if reviewed_input["path"] in public_link_changes:
            reviewed_input["reason"] = "Workspace links require an actual current published version; the editor server computes eligible unsigned published artifact destinations and the signed current field without changing authorization"
        elif reviewed_input["path"] == "components/slides/deck-editor-client.tsx":
            reviewed_input["reason"] += "; published-only public links and server-computed eligible unsigned artifact anchors replace dead preview links without changing authorization"
for reviewed_input in report["providerPrerequisite"]["reviewedInputs"]:
    if reviewed_input["path"] in public_link_changes:
        reviewed_input["reason"] = "Workspace links require an actual current published version; the editor server computes eligible unsigned published artifact destinations and the signed current field without changing authorization"
    elif reviewed_input["path"] == "components/slides/deck-editor-client.tsx":
        reviewed_input["reason"] += "; published-only public links and server-computed eligible unsigned artifact anchors replace dead preview links without changing authorization"
application_ninth_bytes = (repo / APPLICATION_NINTH_PATH).read_bytes()
assert len(application_ninth_bytes) == APPLICATION_NINTH_BYTES and sha(application_ninth_bytes) == APPLICATION_NINTH_SHA256
application_ninth = json.loads(application_ninth_bytes)
assert application_ninth["sourceCommit"] == APPLICATION_NINTH_SOURCE and application_ninth["passed"] is False
assert application_ninth["providerCasesExecutedThisAttempt"] == 0 and not application_ninth.get("freshBrowserCasesPassed")
assert "playwright" not in application_ninth and application_ninth["error"] == "KeyError: 'tsconfigPath'"
ninth_protected = application_ninth["sourceExport"]["inputs"]
assert len(ninth_protected) == 286 and all(before.get(name) == row for name, row in ninth_protected.items()), "Ninth application attempt runtime inputs must remain exact"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_NINTH_PATH, "bytes": len(application_ninth_bytes), "sha256": sha(application_ninth_bytes),
    "sourceCommit": APPLICATION_NINTH_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 0, "acceptedBrowserCases": 0, "carriedCases": 0,
    "failurePhase": "The actual production build exited zero; the controller then required a manifest tsconfigPath property that Next omits for its default, before server or browser startup",
    "protectedInputs": 286, "preservedExactInputs": 286, "allowedRuntimeInputs": [], "allowedDocumentationOnlyInputs": [], "reviewedInputs": []})
application_tenth_bytes = (repo / APPLICATION_TENTH_PATH).read_bytes()
assert len(application_tenth_bytes) == APPLICATION_TENTH_BYTES and sha(application_tenth_bytes) == APPLICATION_TENTH_SHA256
application_tenth = json.loads(application_tenth_bytes)
assert application_tenth["sourceCommit"] == APPLICATION_TENTH_SOURCE and application_tenth["passed"] is False
assert application_tenth["providerCasesExecutedThisAttempt"] == 0 and application_tenth["playwright"]["stats"]["unexpected"] == 4
tenth_protected = application_tenth["sourceExport"]["inputs"]
assert len(tenth_protected) == 286 and all(before.get(name) == row for name, row in tenth_protected.items()), "Tenth application inputs, including every assertion and frozen lock, must remain exact"
report["previousApplicationAttempts"].append({"receipt": APPLICATION_TENTH_PATH, "bytes": len(application_tenth_bytes), "sha256": sha(application_tenth_bytes),
    "sourceCommit": APPLICATION_TENTH_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 4, "acceptedBrowserCases": 0, "carriedCases": 0,
    "failurePhase": "Production startup and Secure-cookie checks passed; all four exact first Slides POSTs aborted after HTTP200 RSC headers",
    "protectedInputs": 286, "preservedExactInputs": 286, "allowedRuntimeInputs": [], "allowedDocumentationOnlyInputs": [], "reviewedInputs": []})
report["diagnosticPurpose"] = {"boundary": "Isolated Playwright1.65/Chromium158 profile over the identical production app, Secure cookies, TLS, journeys and strict completion/failure gates",
    "diagnosticOnly": True, "originalPublicationDeadlineSeconds": 10, "newPostFailureBudgetGranted": False, "originalRequestErrorRethrown": True,
    "extraSlidesCloneTeeOrRead": False, "abortFixClaimed": False, "guaranteedPass": False, "completionAndFailureRulesUnchanged": True,
    "cdpInterceptionStillEnabled": True, "fullyUnpausedBaselineClaimed": False,
    "passivePolicyLimit": "An admitted first-party URL's invalid-method effect may begin before passive validation fails; unknown, foreign and model URLs remain blocked in owned disposable fixtures without external AI/model provider credentials"}
report["authoredFixtureDesign"] = {"users": 8, "slides": 8, "workspaces": 9, "originalAndVictimObjectProofs": 8,
    "secondaryWorkspaceCase": "report-desktop", "primaryWorkspaceUnchanged": "hq", "runtimeAcceptanceClaimedByThisMetadata": False}


def guard(label):
    current = vector(); assert current == before
    report["sourceGuards"].append({"label": label, "files": len(current), "bytes": sum(row["bytes"] for row in current.values()),
        "matches": True, "vectorSha256": sha(json.dumps(current, sort_keys=True, separators=(",", ":")).encode())})


guard("before")
root = Path(tempfile.mkdtemp(prefix="ivsa-", dir="/tmp")); os.chmod(root, 0o700)
identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
nonce = os.urandom(16).hex(); (root / ".owner").write_text(nonce)
os.chmod(root / ".owner", 0o600)
assert root.resolve() == root
app, stack, browser_tools = root / "app", root / "stack", root / "browser-tools"
for name in ["app", "stack", "home", "supabase-home", "cache", "config", "tmp", "docker", "browser-tools"]: (root / name).mkdir(mode=0o700)
browser_inputs, browser_links = {}, {}
for name in ["npm-user", "npm-global"]: (root / name).write_text("")
project = "iv-supabase-app-" + source[:12]
groups, export, observed, raw_captures = [], {}, {}, []
docker_before, cli, stack_attempted, stack_ready, installed, status = None, None, False, False, False, 1
secrets, keys_known = {"authored-ci-runtime"}, False
signing_secret = os.urandom(32).hex(); secrets.add(signing_secret)
report["signingSecret"] = {"generatedOwned": True, "entropyBytes": 32, "sharedBuildServerHelpers": True, "retained": False}
managed, seeded, dns_changed, dns_attempted = {}, False, False, False
env = {"PATH": os.environ["PATH"], "CI": "true", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1",
    "HOME": str(root / "home"), "SUPABASE_HOME": str(root / "supabase-home"), "TMPDIR": str(root / "tmp"),
    "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"), "DOCKER_CONFIG": str(root / "docker"),
    "npm_config_cache": str(root / "npm-cache"), "npm_config_userconfig": str(root / "npm-user"), "npm_config_globalconfig": str(root / "npm-global"),
    "PLAYWRIGHT_BROWSERS_PATH": str(root / "browsers"), "SUPABASE_TELEMETRY_DISABLED": "1", "SUPABASE_NO_KEYRING": "1", "SUPABASE_EXPERIMENTAL_STACK": "0",
    "DO_NOT_TRACK": "1", "NEXT_TELEMETRY_DISABLED": "1", "PERSISTENCE_PROVIDER": "supabase", "STORAGE_PROVIDER": "supabase", "AUTH_PROVIDER": "portable",
    "AI_ENABLED": "false", "EVE_ENABLED": "false", "WORKFLOWS_ENABLED": "false", "QUEUES_ENABLED": "false", "SANDBOX_QA_ENABLED": "false",
    "NEXT_PUBLIC_APP_URL": APP_ORIGIN, "SUPABASE_DATABASE_URL": RUNTIME, "SUPABASE_URL": STORAGE_ORIGIN, "SUPABASE_STORAGE_BUCKET": "iv-private-application",
    "IV_SUPABASE_ADMIN_URL": ADMIN, "IV_SUPABASE_API_URL": "http://127.0.0.1:54321",
    "IV_SUPABASE_APPLICATION_CHECKS": "disposable", "IV_SUPABASE_APPLICATION_ROOT": str(root), "IV_SUPABASE_APPLICATION_NONCE": nonce,
    "IV_SUPABASE_APP_ORIGIN": APP_ORIGIN, "IV_SUPABASE_APP_FIXTURES": str(root / "fixtures.json"),
    "IV_SUPABASE_BROWSER_REPORT": str(root / "browser.json"), "IV_SUPABASE_BROWSER_OUTPUT": str(root / "browser-output"), "SOURCE_COMMIT": source}
env["VISUALIZATION_SIGNING_SECRET"] = signing_secret


def process_stat(entry):
    _prefix, separator, tail = (entry / "stat").read_text().rpartition(") "); fields = tail.split()
    assert separator and len(fields) >= 20 and fields[2].isdigit() and fields[19].isdigit()
    return fields


baseline = {}
for entry in Path("/proc").iterdir():
    if not entry.name.isdigit(): continue
    try:
        if entry.stat().st_uid == os.getuid(): baseline[entry.name] = process_stat(entry)[19]
    except (FileNotFoundError, ProcessLookupError): pass


def owned_processes():
    owned, uncertain = [], []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit(): continue
        try:
            if entry.stat().st_uid != os.getuid(): continue
            fields = process_stat(entry)
            if baseline.get(entry.name) == fields[19] or fields[0] == "Z": continue
            cwd = os.readlink(entry / "cwd"); argv = (entry / "cmdline").read_bytes().split(b"\0")
            environ = (entry / "environ").read_bytes().split(b"\0"); pgid = int(fields[2]); prefix = os.fsencode(str(root))
            match = pgid in groups or cwd == str(root) or cwd.startswith(str(root) + "/") or any(prefix + b"/" in value for value in argv)
            match = match or any(value.startswith(key + b"=" + prefix + b"/") for value in environ for key in [b"HOME", b"TMPDIR", b"SUPABASE_HOME", b"XDG_CONFIG_HOME"])
            if match:
                row = {"pid": int(entry.name), "startTime": fields[19], "pgid": pgid, "state": fields[0], "executable": Path(os.fsdecode(argv[0])).name}
                owned.append(row); observed[(row["pid"], row["startTime"])] = row
        except (FileNotFoundError, ProcessLookupError): pass
        except (PermissionError, OSError, ValueError, AssertionError): uncertain.append(int(entry.name))
    return owned, uncertain


def group_absent(pgid):
    try: os.killpg(pgid, 0); return False
    except ProcessLookupError: return True
    except PermissionError: return False


def capture(data, total=None, digest=None):
    total = len(data) if total is None else total
    value = {"observedOriginalBytes": total, "observedOriginalSha256": digest or sha(data), "originalRetained": False, "complete": total <= MAX and len(data) == total}
    raw_captures.append((value, data[:MAX])); return value


def check_export():
    for directory, inputs in [(app, export), (browser_tools, browser_inputs)]:
        for name, row in inputs.items():
            file = directory / name; info = file.lstat()
            assert stat.S_ISREG(info.st_mode) and not file.is_symlink() and sha(file.read_bytes()) == row["sha256"]
            assert bool(info.st_mode & 0o111) == (row["mode"] == "100755")
    for name, target in browser_links.items():
        link = browser_tools / "node_modules" / name
        assert link.is_symlink() and link.resolve(strict=True) == target


def run(argv, timeout=60, accepted=(0,), cwd=None):
    limit = min(time.monotonic() + timeout, (cleanup_end or work_end) - 6.5)
    assert limit > time.monotonic() and (cleanup_end is not None or interruption is None)
    proc = subprocess.Popen(argv, cwd=cwd or app, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, umask=0o022)
    groups.append(proc.pid); selector = selectors.DefaultSelector(); buffers, eof = [bytearray(), bytearray()], [False, False]
    totals, digests = [0, 0], [hashlib.sha256(), hashlib.sha256()]
    for index, pipe in enumerate([proc.stdout, proc.stderr]): os.set_blocking(pipe.fileno(), False); selector.register(pipe, selectors.EVENT_READ, index)
    row = {"argv": argv, "pid": proc.pid, "timedOut": False, "termSent": False, "killSent": False, "forcedDrain": False}
    started, term_at, kill_at = time.monotonic(), None, None
    try:
        while True:
            now = time.monotonic(); overflow = any(value > MAX for value in totals) or cleanup_end is None and any(file.stat().st_size > MAX for item in managed.values() for file in item["files"])
            if (now >= limit or overflow or interruption is not None and cleanup_end is None) and term_at is None:
                row.update({"timedOut": now >= limit, "overflow": overflow, "termSent": True}); term_at = now
                try: os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError: pass
            if term_at is not None and now - term_at >= 2 and kill_at is None and (proc.poll() is None or not all(eof) or not group_absent(proc.pid)):
                row["killSent"] = True; kill_at = now
                try: os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError: pass
            for key, _mask in selector.select(0.1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if chunk:
                    totals[key.data] += len(chunk); digests[key.data].update(chunk)
                    buffers[key.data].extend(chunk[:max(0, MAX - len(buffers[key.data]))])
                else: eof[key.data] = True; selector.unregister(key.fileobj); key.fileobj.close()
            owned_processes()
            if proc.poll() is not None and all(eof) and group_absent(proc.pid): break
            if term_at is not None and now - term_at >= 6: row["forcedDrain"] = True; break
    finally:
        for key in list(selector.get_map().values()): key.fileobj.close()
        selector.close()
    reaped = proc.poll() is not None
    if reaped: proc.wait()
    row.update({"exitCode": proc.returncode, "seconds": round(time.monotonic() - started, 3), "exitObservedAndReaped": reaped,
        "pipesEOF": eof, "originalProcessGroupAbsent": group_absent(proc.pid), "stdout": capture(bytes(buffers[0]), totals[0], digests[0].hexdigest()), "stderr": capture(bytes(buffers[1]), totals[1], digests[1].hexdigest())})
    report["commands"].append(row)
    try: check_export()
    except (OSError, AssertionError) as error:
        report.setdefault("exportViolations", []).append({"phase": "cleanup" if cleanup_end is not None else "work", "error": type(error).__name__ + ": " + str(error)})
        if cleanup_end is None: raise
    assert reaped and all(eof) and row["originalProcessGroupAbsent"] and not any(row[key] for key in ["termSent", "killSent", "timedOut", "forcedDrain"]), "Command lifecycle incomplete"
    assert all(row[key]["complete"] for key in ["stdout", "stderr"]) and proc.returncode in accepted, "Command failed: " + str(argv[0])
    return bytes(buffers[0])


def docker_snapshot():
    result = {}
    for kind, listing, id_field, labels in [("container", ["ps", "-aq", "--no-trunc"], ".Id", ".Config.Labels"),
            ("network", ["network", "ls", "-q", "--no-trunc"], ".Id", ".Labels"), ("volume", ["volume", "ls", "-q"], ".Name", ".Labels")]:
        ids = run(["docker", *listing], 15).decode().split()
        extra = ',"state":{{json .State.Status}},"ports":{{json .NetworkSettings.Ports}},"mounts":{{json .Mounts}}' if kind == "container" else ""
        template = '{"id":{{json ' + id_field + '}},"name":{{json .Name}},"labels":{{json ' + labels + '}}' + extra + '}'
        rows = [json.loads(line) for line in run(["docker", "inspect", "--type", kind, "--format", template, *ids], 20).decode().splitlines()] if ids else []
        result[kind] = {row["id"]: row for row in rows}
    return result


def owned_docker(current):
    result = {}
    for kind, rows in current.items():
        result[kind] = {}
        for key, row in rows.items():
            if key in docker_before[kind]:
                assert row == docker_before[kind][key], "Pre-existing Docker identity changed"
                continue
            name, labels = row["name"].lstrip("/"), row["labels"] or {}
            assert name.startswith("supabase_") and name.endswith("_" + project) and labels.get("com.supabase.cli.project") == project, "Unclassified new Docker object"
            result[kind][key] = row
        assert set(docker_before[kind]) <= rows.keys(), "Pre-existing Docker object disappeared"
    return result


def node(code, timeout=25):
    return json.loads(run(["node", "--input-type=module", "-e", code], timeout))



def capture_file(file):
    before = file.lstat()
    assert stat.S_ISREG(before.st_mode) and not file.is_symlink() and before.st_uid == os.getuid() and before.st_nlink == 1
    total, digest, retained = 0, hashlib.sha256(), bytearray()
    with file.open("rb") as handle:
        while chunk := handle.read(65536):
            total += len(chunk); digest.update(chunk); retained.extend(chunk[:max(0, MAX - len(retained))])
    after = file.lstat()
    assert (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
    assert total == before.st_size
    data = bytes(retained)
    return capture(data, total, digest.hexdigest()), data


def helper(command, *args, overrides=None):
    previous = dict(env)
    try:
        env.update(overrides or {})
        value = json.loads(run(["node", "--import", "tsx", "scripts/supabase-application-fixture.ts", command, *args], 30))
        assert value.get("sourceCommit", source) == source and value.get("passed") is not False
        report.setdefault("helperCommands", []).append({"command": command, "result": value, "freshProcessReaped": True})
        return value
    finally: env.clear(); env.update(previous)


def start_managed(name, argv):
    assert name not in managed
    files = [root / (name + "." + label) for label in ["stdout", "stderr"]]
    handles = [file.open("xb") for file in files]
    for file in files: os.chmod(file, 0o600)
    child_env = {key: value for key, value in env.items() if key not in ["IV_SUPABASE_ADMIN_URL", "IV_SUPABASE_SERVICE_KEY", "IV_SUPABASE_ANON_KEY"]}
    proc = subprocess.Popen(argv, cwd=app, env=child_env, stdin=subprocess.DEVNULL, stdout=handles[0], stderr=handles[1], start_new_session=True)
    groups.append(proc.pid)
    managed[name] = {"proc": proc, "files": files, "handles": handles, "argv": argv, "started": time.monotonic()}
    report.setdefault("managed", {})[name] = {"pid": proc.pid, "argv": argv, "intentionalStop": False, "killSent": False}


def stop_managed(name):
    item = managed[name]; proc = item["proc"]; row = report["managed"][name]
    if proc.poll() is None:
        row["intentionalStop"] = True
        try: os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError: pass
    deadline = min(time.monotonic() + 15, (cleanup_end or work_end) - 8)
    while time.monotonic() < deadline and (proc.poll() is None or not group_absent(proc.pid)): time.sleep(0.1)
    reaped = proc.poll() is not None
    if reaped: proc.wait()
    for handle in item["handles"]: handle.close()
    row.update({"exitCode": proc.returncode, "exitObservedAndReaped": reaped, "outputFilesClosed": all(handle.closed for handle in item["handles"]),
        "originalProcessGroupAbsent": group_absent(proc.pid), "seconds": round(time.monotonic() - item["started"], 3)})
    if name == "next" and reaped and row["originalProcessGroupAbsent"]: telemetry_grace()
    for label, file in zip(["stdout", "stderr"], item["files"]): row[label], _raw = capture_file(file)
    assert reaped and proc.returncode == 0 and row["outputFilesClosed"] and row["originalProcessGroupAbsent"], "Owned managed service did not close normally"


def fixture_secrets():
    file = Path(env["IV_SUPABASE_APP_FIXTURES"]); before = file.lstat()
    assert file.parent == root and stat.S_ISREG(before.st_mode) and not file.is_symlink() and before.st_uid == os.getuid()
    assert before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600 and 0 < before.st_size <= 256 * 1024
    descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor); data = os.read(descriptor, 256 * 1024 + 1); after = os.fstat(descriptor)
    finally: os.close(descriptor)
    named = file.lstat()
    identity_fields = lambda s: (s.st_dev, s.st_ino, s.st_uid, s.st_nlink, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    assert identity_fields(before) == identity_fields(info) == identity_fields(after) == identity_fields(named) and len(data) == before.st_size
    value = json.loads(data)
    assert value["schemaVersion"] == 1 and value["sourceCommit"] == source and value["appOrigin"] == APP_ORIGIN
    assert set(value["cases"]) == {"course-desktop", "course-narrow", "report-desktop", "report-narrow"}
    for case in value["cases"].values():
        password = case["password"]
        assert isinstance(password, str) and len(password) >= 24
        secrets.update([password, password + "-publication", case["email"]])
    report["privateFixtures"] = {"bytes": len(data), "sha256": sha(data), "mode": "0o600", "identityVerified": True, "contentsRetained": False, "actorPasswordsAddedToRedaction": 4}
    return value


def dns_aliases(action):
    global dns_changed, dns_attempted
    backup = root / "hosts.before"
    if action == "add":
        data = Path("/etc/hosts").read_bytes()
        assert len(data) <= 65536 and not any(host in line.split(b"#", 1)[0].split() for line in data.splitlines() for host in [DB_HOST.encode(), API_HOST.encode()])
        with backup.open("xb") as file: file.write(data)
        os.chmod(backup, 0o600)
    code = r'''import os,sys,stat,fcntl,hashlib,json
from pathlib import Path
action,folder,nonce,uid,dbhost,apihost=sys.argv[1:];root=Path(folder)
assert root.parent==Path('/tmp') and root.name.startswith('ivsa-') and root.resolve()==root
assert root.stat().st_uid==int(uid) and stat.S_IMODE(root.stat().st_mode)==0o700 and (root/'.owner').read_text()==nonce
fd=os.open(root/'hosts.before',os.O_RDONLY|os.O_NOFOLLOW)
try:
 info=os.fstat(fd);assert info.st_uid==int(uid) and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o600 and info.st_size<=65536
 original=os.read(fd,65537);assert len(original)==info.st_size
finally:os.close(fd)
addition=('\n127.0.0.1 '+dbhost+' '+apihost+' # iv-supabase-application-'+nonce+'\n').encode()
expected,desired=(original,original+addition) if action=='add' else (original+addition,original)
fd=os.open('/etc/hosts',os.O_RDWR|os.O_NOFOLLOW)
try:
 fcntl.flock(fd,fcntl.LOCK_EX);before=os.fstat(fd)
 assert stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_nlink==1 and not before.st_mode&0o022
 actual=os.read(fd,65537)
 if action=='restore' and actual==original:expected=original
 assert actual==expected,'Hosts changed outside owned append; overwrite refused'
 os.lseek(fd,0,0);assert os.write(fd,desired)==len(desired);os.ftruncate(fd,len(desired));os.fsync(fd)
 after=os.fstat(fd);assert (before.st_dev,before.st_ino,before.st_uid)==(after.st_dev,after.st_ino,after.st_uid)
 os.lseek(fd,0,0);assert os.read(fd,65537)==desired
 print(json.dumps({'action':action,'beforeSha256':hashlib.sha256(expected).hexdigest(),'afterSha256':hashlib.sha256(desired).hexdigest(),'identityMatches':True}))
finally:os.close(fd)'''
    if action == "add": dns_attempted = True
    result = json.loads(run(["sudo", "-n", sys.executable, "-c", code, action, str(root), nonce, str(os.getuid()), DB_HOST, API_HOST], 15))
    report.setdefault("dns", []).append(result); dns_changed = action == "add"
    if action == "add":
        assert all(row[4][0] == "127.0.0.1" for host in [DB_HOST, API_HOST] for row in socket.getaddrinfo(host, None))


def certificates():
    for label in ["ca", "wrong-ca"]:
        run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(root / (label + ".key")), "-out", str(root / (label + ".pem")), "-days", "1", "-sha256", "-subj", "/CN=IV owned " + label], 25)
        os.chmod(root / (label + ".key"), 0o600)
    for label, host in [("db", DB_HOST), ("api", API_HOST)]:
        run(["openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", str(root / (label + ".key")), "-out", str(root / (label + ".csr")), "-subj", "/CN=" + host], 25)
        os.chmod(root / (label + ".key"), 0o600)
    for label, key, host in [("db", "db", DB_HOST), ("wrong-san", "db", "wrong.owned.invalid"), ("api", "api", API_HOST)]:
        extension = root / (label + ".ext")
        extension.write_text("subjectAltName=DNS:" + host + "\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n")
        run(["openssl", "x509", "-req", "-in", str(root / (key + ".csr")), "-CA", str(root / "ca.pem"), "-CAkey", str(root / "ca.key"), "-CAcreateserial", "-out", str(root / (label + ".pem")), "-days", "1", "-sha256", "-extfile", str(extension)], 15)
    for label in ["ca", "wrong-ca", "db", "api"]:
        file = root / (label + ".key"); info = file.lstat()
        assert stat.S_ISREG(info.st_mode) and not file.is_symlink() and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600
    report["certificates"] = {label: {"bytes": (root / (label + ".pem")).stat().st_size, "sha256": sha((root / (label + ".pem")).read_bytes())} for label in ["ca", "wrong-ca", "db", "wrong-san", "api"]}
    report["privateKeysRetainedInEvidence"] = False
    env["NODE_EXTRA_CA_CERTS"] = str(root / "ca.pem")


def restore_dns_if_closed():
    owned, uncertain = owned_processes()
    if owned or uncertain:
        report["dnsRestoreDeferred"] = {"remaining": owned, "uncertain": uncertain, "reason": "Retain loopback aliases until every owned client has closed"}
        return False
    dns_aliases("restore")
    return True


def reload_database(db_id):
    stamp = node("""import pg from 'pg';const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,statement_timeout:5000});try{console.log(JSON.stringify({stamp:(await p.query('SELECT pg_conf_load_time()::text AS stamp')).rows[0].stamp}));}finally{await p.end();}""")["stamp"]
    run(["docker", "kill", "--signal=HUP", db_id], 10)
    node("""import pg from 'pg';const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,statement_timeout:5000});try{let changed=false;const end=Date.now()+5000;while(Date.now()<end){changed=(await p.query('SELECT pg_conf_load_time() > $1::timestamptz AS changed',[""" + json.dumps(stamp) + """])).rows[0].changed;if(changed)break;await new Promise(r=>setTimeout(r,50));}if(!changed)throw Error('Owned DB configuration reload was not observed');console.log(JSON.stringify({reloadObserved:true}));}finally{await p.end();}""", 15)


def install_database_tls(db_id):
    data_directory = run(["docker", "exec", "--user", "postgres", db_id, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", "postgres", "-c", "SHOW data_directory"], 15).decode().strip()
    assert re.fullmatch(r"/[A-Za-z0-9_./-]+", data_directory) and ".." not in Path(data_directory).parts
    container = next(row for row in report["dockerStarted"]["container"].values() if row["id"] == db_id)
    owned_volumes = set(report["dockerStarted"]["volume"])
    assert any(mount["Type"] == "volume" and mount["Name"] in owned_volumes and Path(data_directory).is_relative_to(mount["Destination"]) for mount in container["mounts"]), "DB data directory is not on its owned fresh volume"
    uid = run(["docker", "exec", db_id, "id", "-u", "postgres"], 10).decode().strip()
    gid = run(["docker", "exec", db_id, "id", "-g", "postgres"], 10).decode().strip()
    assert uid.isdigit() and gid.isdigit()
    run(["docker", "exec", "--user", "0", db_id, "mkdir", "-m", "0700", "/tmp/iv-owned-tls"], 10)
    run(["docker", "cp", str(root / "db.key"), db_id + ":/tmp/iv-owned-tls/server.key"], 10)
    run(["docker", "cp", str(root / "db.pem"), db_id + ":/tmp/iv-owned-tls/server.crt"], 10)
    run(["docker", "exec", "--user", "0", db_id, "chown", "-R", uid + ":" + gid, "/tmp/iv-owned-tls"], 10)
    run(["docker", "exec", "--user", "0", db_id, "chmod", "0600", "/tmp/iv-owned-tls/server.key"], 10)
    block = "\n# Owned disposable application TLS fixture\nssl=on\nssl_cert_file='/tmp/iv-owned-tls/server.crt'\nssl_key_file='/tmp/iv-owned-tls/server.key'\n"
    run(["docker", "exec", "--user", "postgres", db_id, "sh", "-c", 'printf "%s\\n" "$2" >> "$1/postgresql.auto.conf"', "iv-owned-tls", data_directory, block], 10)
    reload_database(db_id)
    report["databaseTLS"] = {"containerId": db_id, "ownedDataVolumeVerified": True, "serverConfigAppended": True, "privateKeyMode": "0o600", "signal": "HUP", "contentsRetained": False}


def switch_database_certificate(db_id, label):
    assert label in ["db", "wrong-san"]
    run(["docker", "cp", str(root / (label + ".pem")), db_id + ":/tmp/iv-owned-tls/server.crt"], 10)
    run(["docker", "exec", "--user", "0", db_id, "chmod", "0644", "/tmp/iv-owned-tls/server.crt"], 10)
    reload_database(db_id)


def start_proxy():
    script = root / "https-proxy.py"
    script.write_text(r'''import http.client,http.server,ssl,signal,threading,json,sys
active=0;requests=0;failures=[];lock=threading.Lock()
class Handler(http.server.BaseHTTPRequestHandler):
 protocol_version='HTTP/1.0'
 def log_message(self,*args):pass
 def forward(self):
  global active,requests
  with lock:active+=1;requests+=1
  upstream=None
  try:
   if self.headers.get('Host')!='abcdefghijklmnopqrst.supabase.co:54443' or not self.path.startswith('/storage/v1/') or '?' in self.path or '#' in self.path:raise ValueError('route')
   size=int(self.headers.get('Content-Length','0'))
   if size<0 or size>64*1024*1024 or self.headers.get('Transfer-Encoding'):raise ValueError('bound')
   body=self.rfile.read(size)
   if len(body)!=size:raise ValueError('short request')
   headers={key:value for key,value in self.headers.items() if key.lower() not in ['host','connection','transfer-encoding','content-length']}
   headers['Host']='127.0.0.1:54321';headers['Content-Length']=str(len(body));headers['Connection']='close'
   upstream=http.client.HTTPConnection('127.0.0.1',54321,timeout=15);upstream.request(self.command,self.path,body=body,headers=headers)
   response=upstream.getresponse();data=response.read(64*1024*1024+1)
   if len(data)>64*1024*1024:raise ValueError('response bound')
   self.send_response(response.status)
   for key,value in response.getheaders():
    if key.lower() not in ['connection','content-length','transfer-encoding']:self.send_header(key,value)
   self.send_header('Content-Length',str(len(data)));self.send_header('Connection','close');self.end_headers();self.wfile.write(data)
  except Exception:
   with lock:
    if len(failures)<16:failures.append('proxy-request-failed')
   try:self.send_error(502,'Owned upstream unavailable')
   except Exception:pass
  finally:
   if upstream:upstream.close()
   with lock:active-=1
 do_GET=forward;do_POST=forward;do_DELETE=forward
class Server(http.server.ThreadingHTTPServer):daemon_threads=True
server=Server(('127.0.0.1',54443),Handler);context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2
context.load_cert_chain(sys.argv[1],sys.argv[2]);server.socket=context.wrap_socket(server.socket,server_side=True)
def stop(*args):threading.Thread(target=server.shutdown,daemon=True).start()
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
try:server.serve_forever(poll_interval=.05)
finally:server.server_close();print(json.dumps({'requests':requests,'active':active,'failures':failures}),flush=True)
sys.exit(0 if active==0 and not failures else 1)
''')
    os.chmod(script, 0o600)
    start_managed("proxy", [sys.executable, str(script), str(root / "api.pem"), str(root / "api.key")])


def prepare_browser_tools():
    spec, config = "tests/e2e/supabase-application.spec.ts", "playwright.supabase-application.config.ts"
    names = [spec, config, "tsconfig.json", "lib/utils.ts", "packages/domain/canonical.ts",
        "packages/domain/entities.ts", "packages/domain/fixtures.ts", "packages/domain/ids.ts"]
    for name in names:
        row, destination = export[name], browser_tools / name
        assert row["mode"] == "100644" and not destination.exists()
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(app / name, destination); os.chmod(destination, 0o644)
        browser_inputs[name] = row
    (browser_tools / "package.json").write_text(json.dumps({"name": "iv-browser-check-tools", "version": "0.0.0", "private": True,
        "devDependencies": {"@playwright/test": "1.65.0"}}) + "\n")
    run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=optional"], 90, cwd=browser_tools)
    modules = browser_tools / "node_modules"
    pins = {"@playwright/test": "sha512-iGURLGuKDLakSEl7Pgfv8h7f+XLT+V861Wfhz0zlEl5nyFuKUopdkFBPKqTllTUp06aOwPuH8iuUEb3yp3MpbQ==",
        "playwright": "sha512-F3AMWcR44qMBt4kq+6Kb6mX7bjGXshktKFOPULd7reED6ZJWevjbNRqysP7q+AATE9kdPEZBibex1BYsvpVoeA==",
        "playwright-core": "sha512-vNSKgH6YqtN7cdT/L334zo0a+YwkrpicyrHJlWWPIm/Q+Nn2SWInil01oT0mbu96U4GgoRtCYQD9CzJQgju+lA=="}
    lock_bytes = (browser_tools / "package-lock.json").read_bytes(); assert len(lock_bytes) <= 16384
    tool_lock = json.loads(lock_bytes); locked = tool_lock["packages"]
    assert set(locked) == {"", *("node_modules/" + name for name in pins)}
    for name, digest in pins.items():
        row = locked["node_modules/" + name]; metadata = json.loads((modules / name / "package.json").read_text())
        assert metadata["name"] == name and metadata["version"] == row["version"] == "1.65.0" and row["integrity"] == digest
        assert urlsplit(row["resolved"]).scheme == "https" and urlsplit(row["resolved"]).netloc == "registry.npmjs.org"
    lock = json.loads((app / "package-lock.json").read_bytes())["packages"]
    links = []
    for name in ["clsx", "date-fns", "tailwind-merge", "uuid"]:
        target, link = app / "node_modules" / name, modules / name
        assert target.is_dir() and target.resolve(strict=True) == target and not link.exists() and not link.is_symlink()
        version = json.loads((target / "package.json").read_text())["version"]
        assert version == lock["node_modules/" + name]["version"]
        link.symlink_to(os.path.relpath(target, modules), target_is_directory=True); browser_links[name] = target
        links.append({"name": name, "version": version, "appLockIntegrity": lock["node_modules/" + name]["integrity"]})
    versions = (modules / "playwright-core/browsers.json").read_bytes()
    shells = [row for row in json.loads(versions)["browsers"] if row["name"] == "chromium-headless-shell"]
    assert len(shells) == 1 and shells[0]["revision"] == "1254" and shells[0]["browserVersion"] == "158.0.8127.18"
    report["browserToolchain"] = {"version": "1.65.0", "isolatedFromAppDependencies": True, "appLockSha256": LOCK_SHA,
        "toolLock": tool_lock, "toolLockBytes": len(lock_bytes), "toolLockSha256": sha(lock_bytes), "browserManifestSha256": sha(versions),
        "shell": shells[0], "copiedInputs": browser_inputs, "sharedAppDependencies": links, "fixtureHelperCwd": "app"}
    profile_tsconfig = browser_tools / "tsconfig.current-browser.json"
    profile_tsconfig.write_text(json.dumps({"extends": "./tsconfig.json", "include": [spec, config], "exclude": ["node_modules"],
        "compilerOptions": {"incremental": False, "plugins": [], "types": ["node"], "typeRoots": [str(app / "node_modules/@types")]}}))
    run([str(app / "node_modules/.bin/tsc"), "--noEmit", "-p", str(profile_tsconfig)], 60, cwd=browser_tools)
    report["browserToolchain"]["focusedTypecheck"] = True
    cli = str(modules / ".bin/playwright")
    run([cli, "install", "--with-deps", "--only-shell", "chromium"], 120, cwd=browser_tools)
    probe = json.loads(run(["node", "--input-type=module", "-e", """import { chromium } from '@playwright/test';
const browser = await chromium.launch({headless:true}); let version;
try { version = browser.version(); } finally { await browser.close(); }
console.log(JSON.stringify({version,browserClosed:true}));"""], 40, cwd=browser_tools))
    assert probe == {"version": "158.0.8127.18", "browserClosed": True}
    report["browserToolchain"]["actualBrowserProbe"] = probe
    check_export()


def bootstrap():
    global installed, docker_before, cli, stack_attempted, stack_ready, keys_known
    configs = {"package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "next.config.ts", "postcss.config.mjs", "playwright.supabase-application.config.ts"}
    required = configs | {MIGRATION, "scripts/supabase-application-fixture.ts", "tests/e2e/supabase-application.spec.ts"}
    selected = [name for name in before if name.startswith(("app/", "components/", "hooks/", "lib/", "packages/", "public/"))
        or name in required or name.startswith("scripts/") and name.endswith(".ts")]
    assert required <= set(selected)
    for name in selected:
        assert before[name]["mode"] != "120000"
        destination = app / name; destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination); os.chmod(destination, 0o755 if before[name]["mode"] == "100755" else 0o644)
        export[name] = before[name]
    report["sourceExport"] = {"files": len(export), "bytes": sum(row["bytes"] for row in export.values()), "inputs": export}
    assert run(["node", "--version"]).strip() == b"v24.21.0"
    lock = (app / "package-lock.json").read_bytes(); assert len(lock) == 618662 and sha(lock) == LOCK_SHA
    report["frozenLock"] = {"bytes": len(lock), "sha256": LOCK_SHA}
    run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 240); installed = True; guard("after-install")
    scoped = sorted({"lib/persistence/factory.ts", "lib/storage/factory.ts", "scripts/supabase-application-fixture.ts",
        "tests/e2e/supabase-application.spec.ts", "playwright.supabase-application.config.ts", "components/slides/deck-editor-client.tsx", "app/actions/decks.ts"} | public_link_changes)
    report["focusedStaticInputs"] = scoped
    run(["node_modules/.bin/eslint", *scoped], 60)
    configuration = json.loads((app / "tsconfig.json").read_text())
    assert "**/*.ts" in configuration["include"] and "**/*.tsx" in configuration["include"]
    assert configuration["exclude"] == ["node_modules", "components/ai-elements/**/*"]
    assert all(not name.startswith(("node_modules/", "components/ai-elements/")) and name.endswith((".ts", ".tsx")) for name in scoped)
    (app / "tsconfig.supabase-application-checks.json").write_text(json.dumps({"extends": "./tsconfig.json", "include": scoped,
        "exclude": ["node_modules", "components/ai-elements"], "compilerOptions": {"incremental": False, "plugins": []}}))
    run(["node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.supabase-application-checks.json"], 60)
    report["focusedTypecheck"] = {"entries": scoped, "completed": True, "includesBrowserSpec": True}
    report["semanticTypecheck"] = {"replacement": None, "kind": "Actual Next production build over the unpruned exported root tsconfig graph",
        "testFileDiagnosticsFilteredByNext": True, "browserSpecCoveredBySeparateFocusedTypecheck": True, "completed": False}
    prepare_browser_tools()
    for port in [5432, 54321, 54443, 3100]:
        with socket.socket() as sock: sock.bind(("127.0.0.1", port))
    docker_before = docker_snapshot(); report["dockerBaseline"] = docker_before
    for rows in docker_before.values():
        assert all((row["labels"] or {}).get("com.supabase.cli.project") != project and not row["name"].lstrip("/").endswith("_" + project) for row in rows.values()), "Existing project resources cannot be adopted"
    archive, checksum = root / ASSET, root / "checksums.txt"
    for name, file, size, digest in [(ASSET, archive, 63799117, ARCHIVE_SHA), ("checksums.txt", checksum, 1386, CHECKSUM_SHA)]:
        run(["curl", "-q", "--fail", "--location", "--silent", "--show-error", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "3", "--max-time", "120", "--max-filesize", str(size), "--output", str(file), BASE + name], 125)
        assert file.is_file() and not file.is_symlink() and file.stat().st_size == size and sha(file.read_bytes()) == digest
    assert (ARCHIVE_SHA + "  " + ASSET).encode() in checksum.read_bytes().splitlines()
    report["cliArchive"] = {"version": "3.0.0", "bytes": 63799117, "sha256": ARCHIVE_SHA, "checksumFileSha256": CHECKSUM_SHA}
    cli = root / "supabase"
    with tarfile.open(archive, "r:gz") as handle:
        members = handle.getmembers(); assert 1 <= len(members) <= 16 and sum(row.size for row in members) <= 512 * 1024 * 1024
        assert all(not Path(row.name).is_absolute() and ".." not in Path(row.name).parts and (row.isfile() or row.isdir()) for row in members)
        binary = [row for row in members if row.name == "supabase" and row.isfile()]; assert len(binary) == 1
        with handle.extractfile(binary[0]) as incoming, cli.open("xb") as outgoing: shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
    os.chmod(cli, 0o700); assert cli.read_bytes()[:4] == b"\x7fELF"
    top_help = run([str(cli), "--help"], 20, cwd=stack).decode()
    assert all(command in top_help for command in ["init", "start", "status", "stop"])
    assert run([str(cli), "--version"], 20, cwd=stack).decode().strip() in ["3.0.0", "v3.0.0"]
    help_output = {command: run([str(cli), command, "--help"], 20, cwd=stack).decode() for command in ["init", "start", "status", "stop"]}
    assert "--exclude" in help_output["start"] and "--output" in help_output["status"] and "--no-backup" in help_output["stop"]
    report["cliHelpVerified"] = ["top-level", "init", "start --exclude", "status --output", "stop --no-backup"]
    run([str(cli), "init"], 30, cwd=stack)
    config = tomllib.loads((stack / "supabase/config.toml").read_text()); config["project_id"] = project
    assert config["api"]["port"] == 54321 and config["db"]["major_version"] == 17
    config["db"]["port"] = 5432
    for path in ["realtime", "studio", "edge_runtime", "local_smtp", "analytics", "db.pooler", "db.seed", "storage.vector", "storage.s3_protocol"]:
        item = config
        for key in path.split("."): item = item.setdefault(key, {})
        item["enabled"] = False
    encoded = json.dumps(config).encode(); (stack / "supabase/config.json").write_bytes(encoded); (stack / "supabase/config.toml").unlink()
    report["stackConfiguration"] = {"projectId": project, "bytes": len(encoded), "sha256": sha(encoded), "contentsRetained": False}
    target = stack / MIGRATION; target.parent.mkdir(parents=True, exist_ok=True); assert list(target.parent.iterdir()) == []
    shutil.copyfile(app / MIGRATION, target)
    migration = target.read_bytes()
    assert len(migration) == 12758 and sha(migration) == "73cde35f8ac0f265b1cda968fe1b4b91620ada03b4bab71d41c154c8d02fea43"
    report["migration"] = {"path": MIGRATION, "bytes": len(migration), "sha256": sha(migration)}
    stack_attempted = True
    run([str(cli), "start", "--exclude", "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"], 420, cwd=stack)
    values = json.loads(run([str(cli), "status", "-o", "json"], 30, cwd=stack))
    for key in ["ANON_KEY", "SERVICE_ROLE_KEY"]: assert isinstance(values.get(key), str) and values[key]
    secrets.update(value for key, value in values.items() if isinstance(value, str) and any(label in key for label in ["KEY", "SECRET", "PASSWORD"]))
    secrets.update(value for key, value in values.items() if key.endswith("_URL") and isinstance(value, str) and urlsplit(value).password is not None)
    keys_known = True
    env.update({"IV_SUPABASE_SERVICE_KEY": values["SERVICE_ROLE_KEY"], "IV_SUPABASE_ANON_KEY": values["ANON_KEY"], "SUPABASE_SERVICE_ROLE_KEY": values["SERVICE_ROLE_KEY"]})
    report["localStatus"] = {"parsed": True, "keysRetained": False, "fields": sorted(values)}
    for key, port, schemes in [("API_URL", 54321, ["http"]), ("DB_URL", 5432, ["postgres", "postgresql"])]:
        location = urlsplit(values[key]); assert location.scheme in schemes and location.hostname in ["localhost", "127.0.0.1"] and location.port == port and not location.query and not location.fragment
    report["dockerStarted"] = owned_docker(docker_snapshot())
    containers = {row["name"].lstrip("/"): row for row in report["dockerStarted"]["container"].values()}
    for service, internal, host in [("db", "5432/tcp", "5432"), ("kong", "8000/tcp", "54321")]:
        container = containers["supabase_" + service + "_" + project]
        assert container["state"] == "running" and (container["labels"] or {}).get("com.supabase.cli.workdir") == str(stack)
        bindings = container["ports"].get(internal)
        assert bindings and all(row["HostPort"] == host and row["HostIp"] in ["127.0.0.1", "0.0.0.0", "::"] for row in bindings)
    report["runtimeProvision"] = node("""import pg from 'pg';const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:10000});try{
const row=(await p.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='iv_runtime'")).rows[0];if(!row||row.rolcanlogin!==false)throw Error('Expected newly migrated NOLOGIN role');
await p.query("ALTER ROLE iv_runtime LOGIN PASSWORD 'authored-ci-runtime'");await p.query("COMMENT ON DATABASE postgres IS 'iv-supabase-application-ci:"+process.env.SOURCE_COMMIT+"'");console.log(JSON.stringify({freshRoleProvisioned:true,markerInstalled:true}));}finally{await p.end();}""")
    report["bucketProvision"] = node("""const r=await fetch(process.env.IV_SUPABASE_API_URL+'/storage/v1/bucket',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:process.env.IV_SUPABASE_SERVICE_KEY,Authorization:'Bearer '+process.env.IV_SUPABASE_SERVICE_KEY,'content-type':'application/json'},body:JSON.stringify({id:'iv-private-application',name:'iv-private-application',public:false})});const b=await r.arrayBuffer();if(![200,201].includes(r.status)||b.byteLength>65536)throw Error('Private bucket create failed');console.log(JSON.stringify({privateBucketCreated:true}));""")
    stack_ready = True
    return containers["supabase_db_" + project]["id"]


def runtime_clients(require_zero=False):
    code = """import pg from 'pg';const observations=[],zeroRequired=""" + str(require_zero).lower() + """,deadline=Date.now()+3000;let observationError=null;
async function observe(){const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,connectionTimeoutMillis:1000,statement_timeout:1000});try{
const marker=(await p.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker;
if(marker!=='iv-supabase-application-ci:'+process.env.SOURCE_COMMIT)throw Error('Owned DB marker changed');
const rows=(await p.query("SELECT a.pid,a.backend_start::text,a.application_name,s.ssl,s.version,s.cipher FROM pg_stat_activity a LEFT JOIN pg_stat_ssl s USING(pid) WHERE a.usename='iv_runtime' ORDER BY a.pid")).rows;
const admin=(await p.query('SELECT current_user AS role,pg_backend_pid() AS pid')).rows[0];return{runtimeClients:rows.length,rows,adminRole:admin.role,adminPid:admin.pid};}finally{await p.end();}}
try{do{const row=await observe();observations.push(row);if(!zeroRequired||row.runtimeClients===0)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);}catch{observationError='ADMIN_OBSERVATION_FAILED';}
const last=observations.at(-1)??{runtimeClients:null,rows:[],adminRole:null,adminPid:null};console.log(JSON.stringify({...last,observations,observationError,boundedSeconds:3,freshAdminSessionPerObservation:true,zeroObserved:!observationError&&last.runtimeClients===0,signalsSent:[]}));"""
    result = node(code, 6 if require_zero else 10)
    if require_zero: report.setdefault("runtimeZeroBarriers", []).append(result)
    assert result["observationError"] is None and result["observations"], "Owned admin observation failed"
    assert all(row["adminRole"] == "postgres" for row in result["observations"])
    assert len({row["adminPid"] for row in result["observations"]}) == len(result["observations"])
    if require_zero:
        assert result["zeroObserved"] is True and result["runtimeClients"] == 0, "Fixture/runtime pools remain open after the bounded fresh-session observations"
    return result


def get_route(path, accepted=(200,), timeout=30):
    assert path.startswith("/") and not path.startswith("//") and "?" not in path and "#" not in path
    return node("""import{createHash}from'node:crypto';const r=await fetch(""" + json.dumps(APP_ORIGIN + path) + """,{redirect:'manual',signal:AbortSignal.timeout(""" + str(timeout * 1000) + """)});const reader=r.body?.getReader();let size=0;const hash=createHash('sha256');if(reader)try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>8*1024*1024)throw Error('Warm response too large');hash.update(x.value);}}finally{reader.releaseLock();}
if(!""" + json.dumps(list(accepted)) + """.includes(r.status))throw Error('App route not ready');console.log(JSON.stringify({path:""" + json.dumps(path) + """,status:r.status,bytes:size,sha256:hash.digest('hex'),bodyEOF:true,location:r.headers.get('location')}));""", timeout + 3)


def next_tls_window(label):
    assert "next" in managed and managed["next"]["proc"].poll() is None
    assert all(row["exitObservedAndReaped"] and all(row["pipesEOF"]) and row["originalProcessGroupAbsent"] for row in report["commands"])
    other, uncertain = owned_processes(); assert not uncertain
    assert not any(row["executable"] in ["node", "nodejs"] and row["pgid"] != managed["next"]["proc"].pid for row in other), "Non-Next Node helper is still alive"
    health = node("""const r=await fetch(""" + json.dumps(APP_ORIGIN + "/api/system/capabilities") + """,{redirect:'error',signal:AbortSignal.timeout(15000)});const b=await r.arrayBuffer();if(b.byteLength>131072)throw Error('Health body bound');const v=JSON.parse(new TextDecoder().decode(b));if(r.status!==200||v.persistenceProvider!=='supabase'||v.storageProvider!=='supabase'||v.authProvider!=='portable'||v.health?.ok!==true||v.aiEnabled!==false)throw Error('Actual factory health refused');console.log(JSON.stringify({status:r.status,persistenceProvider:v.persistenceProvider,storageProvider:v.storageProvider,authProvider:v.authProvider,healthOK:v.health.ok,aiEnabled:v.aiEnabled}));""", 20)
    rows = runtime_clients()
    assert rows["runtimeClients"] > 0 and all(row["application_name"] == "intelligent-visualization-supabase" and row["ssl"] is True and row["version"] and row["cipher"] for row in rows["rows"]), "Actual Next TLS session was not observed"
    report.setdefault("nextTLSWindows", []).append({"label": label, "ordinaryCapabilitiesGET": health, "sessions": rows,
        "allFixtureProcessesReaped": True, "attribution": "Only Next may own runtime pools in this explicit window; admin sample is a separate postgres connection.", "continuousJourneyTLSClaimed": False})


def restore_journals():
    journals = list(root.glob("collision-*"))
    allowed = {"course-desktop", "course-narrow", "report-desktop", "report-narrow"}
    assert len(journals) <= 4 and all(file.name in {"collision-" + key + ".json" for key in allowed} for file in journals), "Unknown collision journal"
    for file in journals:
        key = file.name[10:-5]
        helper("collision-off", "--case", key)
    assert not list(root.glob("collision-*"))


def read_browser():
    file = root / "browser.json"
    if not file.exists(): return None
    retained, raw = capture_file(file)
    report["browserJsonCapture"] = retained
    assert retained["complete"]
    value = json.loads(raw); report["playwright"] = value
    return value


def verify_browser(value, fixtures):
    assert value and not value.get("errors")
    stats = value["stats"]
    assert stats["expected"] == 4 and all(stats[key] == 0 for key in ["unexpected", "flaky", "skipped"])
    titles = {kind: "a " + kind.title() + " persists publishes revokes and republishes through Supabase with private Slides attachments and password gates" for kind in ["course", "report"]}
    expected = {(title, profile) for title in titles.values() for profile in ["desktop-chromium", "narrow-chromium"]}
    rows = []
    def walk(suite):
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []): rows.append((spec, test))
        for child in suite.get("suites", []): walk(child)
    for suite in value["suites"]: walk(suite)
    assert len(rows) == 4 and {(spec["title"], test["projectName"]) for spec, test in rows} == expected
    boundaries = []
    for spec, test in rows:
        assert spec["ok"] is True and test["expectedStatus"] == "passed" and test["status"] == "expected" and len(test["results"]) == 1
        result = test["results"][0]
        assert result["status"] == "passed" and result["retry"] == 0 and not result.get("errors") and not result.get("error")
        attachments = [row for row in result.get("attachments", []) if row["name"] == "iv-supabase-application-boundary"]
        assert len(attachments) == 1 and attachments[0]["contentType"] == "application/json" and "body" in attachments[0]
        data = base64.b64decode(attachments[0]["body"], validate=True); assert 0 < len(data) <= 65536
        body = json.loads(data); kind = body["documentKind"]; profile = test["projectName"]
        assert kind in titles and spec["title"] == titles[kind] == body["title"] and body["profile"] == profile
        case = fixtures["cases"][kind + "-" + profile.removesuffix("-chromium")]
        assert body["kind"] == "iv-supabase-application-boundary" and body["schemaVersion"] == 1 and body["stage"] == "complete" and body["status"] == "passed" and body["primaryError"] is None
        assert body["fixture"] == {"workspaceSlug": case["workspaceSlug"], "slidesId": case["slides"]["id"], "slidesPublicId": case["slides"]["publicId"]}
        counts = body["boundary"]["counts"]
        assert set(counts) == {"unexpectedRequests", "unexpectedWebSockets", "requestFailures", "httpErrors", "pageErrors", "consoleErrors", "dialogs", "canonicalAnalytics"} and all(type(x) is int and x == 0 for x in counts.values())
        assert not body["boundary"]["diagnostics"] and body["boundary"]["uploads"] == 1
        assert body["cleanup"] == {"contextsCreated": 4, "contextsClosed": 4, "pendingJobs": 0, "failures": []}
        observation = body["observations"]
        for key in ["workingEditsRetained", "oldVersionStaysRevoked", "foreignRegistrationAndReadRefused", "historicalCollisionPrivateAndPublicRefused", "historicalCollisionRestored", "passwordGateFreshContexts", "oldProtectedVersionStaysPrivate", "freshSignInPreservesPrivateAndPublicState", "courseLocalProgressRetained" if kind == "course" else "reportTextEscaped"]: assert observation[key] is True
        assert observation["initialSave"]["revision"] == 1 and re.fullmatch(r"[0-9a-f-]{36}", observation["initialSave"]["id"])
        publications = observation["publications"]
        assert len(publications) == 2 and [row["sourceRevision"] for row in publications] == [2, 3] and publications[0]["versionId"] != publications[1]["versionId"]
        proofs = observation["responseProofs"]
        assert len(proofs) == 5 and len({row["requestId"] for row in proofs}) == 5
        assert all(row["status"] == 200 and 0 < row["bytes"] <= 5 * 1024 * 1024 and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) for row in proofs)
        snapshots = observation["snapshots"]
        canonical = [row for row in snapshots if row["kind"] == "canonical"]
        assert len(canonical) == 4 and canonical[0]["sha256"] == canonical[1]["sha256"] == canonical[3]["sha256"]
        assert all((canonical[index]["key"], canonical[index]["bytes"]) == (canonical[0]["key"], canonical[0]["bytes"]) for index in [1, 3])
        assert [row["status"] for row in canonical] == ["published", "revoked", "published", "revoked"]
        assert all(canonical[index]["versionId"] == publications[0]["versionId"] for index in [0, 1, 3]) and canonical[2]["versionId"] == publications[1]["versionId"]
        assert len([row for row in snapshots if row["kind"] == "slides"]) == 3
        negatives = [row for row in observation["negatives"] if "conditional" in row]
        assert len(negatives) >= 12 and all(row["status"] == 404 and row["method"] in ["GET", "HEAD"] for row in negatives)
        observer = body["responseObserver"]
        assert observer["kind"] == "native-fetch-response-clone" and observer["maxGetBytes"] == 131072 and observer["maxPostBytes"] == 5 * 1024 * 1024 and observer["maxPerDocument"] == 32
        assert observer["exactGetRequestBindingClaimed"] is False and observer["originalFetchArgumentsAndPromiseRetained"] is True and observer["rawResponseBodiesRetained"] is False
        assert observer["correlation"] == "method-path-request-id-and-time-only" and 1 <= len(observer["documents"]) <= 12
        assert len({row["documentId"] for row in observer["documents"]}) == len(observer["documents"])
        for document in observer["documents"]:
            assert document["pending"] == 0 and document["failures"] == [] and len(document["reads"]) <= 32
            for read in document["reads"]:
                assert read["method"] in ["GET", "POST"] and read["status"] == 200 and read["eof"] is True and read["error"] is None
                assert 0 <= read["bytes"] <= (131072 if read["method"] == "GET" else 5 * 1024 * 1024) and re.fullmatch(r"[0-9a-f]{64}", read["sha256"])
                assert read["startedAt"] <= read["responseAt"] <= read["eofAt"] and "body" not in read
                signal_state = read["signal"]; assert type(signal_state["present"]) is bool
                for flag in ["initialAborted", "abortedAtEOF", "finalAborted"]: assert signal_state[flag] is None or type(signal_state[flag]) is bool
        actual = body["actualApiRequests"]
        assert 1 <= len(actual) <= 64 and len({row["ordinal"] for row in actual}) == len(actual)
        assert all(row["finished"] is True and row["failed"] is None for row in actual)
        boundaries.append({"title": spec["title"], "project": profile, "bytes": len(data), "sha256": sha(data), "report": body})
    report["browserBoundaries"] = boundaries; report["freshBrowserCasesPassed"] = 4


def build_production():
    available = work_end - time.monotonic() - 765
    assert available > 0, "No production build budget remains while reserving the unchanged browser window"
    report["productionBuildBudget"] = {"remainingBuildSeconds": round(available, 3), "commandLimitSeconds": min(240, available),
        "reservedBrowserSeconds": 720, "reservedReadinessAndAuditSeconds": 45, "scopeReduced": False}
    previous = dict(env)
    try:
        for key in ["IV_SUPABASE_ADMIN_URL", "IV_SUPABASE_SERVICE_KEY", "IV_SUPABASE_ANON_KEY"]: env.pop(key, None)
        run(["node", "node_modules/next/dist/bin/next", "build", "--webpack"], min(240, available))
    finally: env.clear(); env.update(previous)
    build = app / ".next"
    manifest = json.loads((build / "required-server-files.json").read_text())
    assert manifest["config"]["output"] == "standalone" and manifest["config"]["typescript"]["ignoreBuildErrors"] is False
    configured_tsconfig = manifest["config"]["typescript"].get("tsconfigPath", "tsconfig.json")
    assert configured_tsconfig == "tsconfig.json"
    entry = build / "standalone/server.js"; info = entry.lstat(); data = entry.read_bytes()
    assert stat.S_ISREG(info.st_mode) and not entry.is_symlink() and info.st_uid == os.getuid()
    assert b"process.env.NODE_ENV = 'production'" in data and entry.resolve().is_relative_to(app)
    copied = []
    for source_directory, destination in [(app / "public", build / "standalone/public"), (build / "static", build / "standalone/.next/static")]:
        assert source_directory.is_dir() and not source_directory.is_symlink() and not destination.exists()
        items = list(source_directory.rglob("*"))
        assert len(items) <= 50000 and all(not item.is_symlink() and item.resolve().is_relative_to(app) for item in items)
        files = [item for item in items if item.is_file()]
        assert all(stat.S_ISREG(item.stat().st_mode) and item.stat().st_uid == os.getuid() for item in files)
        total = sum(item.stat().st_size for item in files); assert total <= 512 * 1024 * 1024
        shutil.copytree(source_directory, destination)
        assert all(sha(item.read_bytes()) == sha((destination / item.relative_to(source_directory)).read_bytes()) for item in files)
        copied.append({"source": str(source_directory.relative_to(app)), "destination": str(destination.relative_to(app)), "files": len(files), "bytes": total, "hashesMatch": True})
    build_id = (build / "BUILD_ID").read_text().strip(); assert re.fullmatch(r"[A-Za-z0-9_-]{1,128}", build_id)
    report["productionBuild"] = {"buildId": build_id, "entry": str(entry.relative_to(app)), "entryBytes": len(data), "entrySha256": sha(data),
        "nodeEnv": "production", "ignoreBuildErrors": False, "tsconfigPath": configured_tsconfig,
        "tsconfigPathUsesNextDefault": "tsconfigPath" not in manifest["config"]["typescript"], "copied": copied, "generatedManifestsOrSecretsRetained": False}
    report["semanticTypecheck"]["completed"] = True
    check_export()


def application_main():
    global seeded
    db_id = bootstrap()
    env["NODE_ENV"] = "production"
    dns_aliases("add"); certificates(); install_database_tls(db_id); start_proxy()
    positive = helper("probe-positive"); assert positive["productionFactories"] is True and positive["ssl"]["ssl"] is True
    assert helper("probe-negative-ca", overrides={"NODE_EXTRA_CA_CERTS": str(root / "wrong-ca.pem")})["expectedFailureObserved"] is True
    try:
        switch_database_certificate(db_id, "wrong-san")
        assert helper("probe-negative-san")["expectedFailureObserved"] is True
    finally: switch_database_certificate(db_id, "db")
    bad_url = RUNTIME.replace("authored-ci-runtime", "authored-ci-wrong-password"); secrets.add("authored-ci-wrong-password")
    assert helper("probe-negative-password", overrides={"SUPABASE_DATABASE_URL": bad_url})["expectedFailureObserved"] is True
    assert helper("probe-positive")["productionFactories"] is True
    seed = helper("seed"); seeded = True; fixtures = fixture_secrets()
    assert seed["users"] == seed["slides"] == 8 and seed["fixtureSha256"] == report["privateFixtures"]["sha256"]
    build_production()
    remaining_nodes, uncertain = owned_processes(); assert not uncertain
    assert not any(row["executable"] in ["node", "nodejs"] for row in remaining_nodes), "Build or fixture Node workers remain before the Next-only window"
    report["runtimeBeforeNext"] = runtime_clients(require_zero=True)
    env["PORT"], env["HOSTNAME"] = "3100", "127.0.0.1"
    start_managed("next", ["node", ".next/standalone/server.js"])
    resolution = sorted({row[4][0] for row in socket.getaddrinfo("localhost", 3100, type=socket.SOCK_STREAM)})
    assert resolution and set(resolution) <= {"127.0.0.1", "::1"}, "localhost resolved outside loopback"
    report["appOriginResolution"] = {"hostname": "localhost", "addresses": resolution, "listenerBind": "127.0.0.1", "port": 3100}
    ready_end = min(time.monotonic() + 60, work_end - 20)
    while True:
        assert managed["next"]["proc"].poll() is None
        try:
            with socket.create_connection(("localhost", 3100), timeout=0.2) as connection:
                assert connection.getpeername()[0] == "127.0.0.1"
                report["appOriginResolution"]["connectedPeer"] = connection.getpeername()[0]
                break
        except OSError:
            assert time.monotonic() < ready_end, "Owned Next listener did not become ready"
            time.sleep(0.1)
    report["warmRoutes"] = [get_route(path, (200, 302, 303, 307, 308), 40) for path in ["/", "/auth", "/app"]]
    for case in fixtures["cases"].values():
        report["warmRoutes"].append(get_route("/app/workspaces/" + case["workspaceSlug"], (200, 302, 303, 307, 308), 40))
        report["warmRoutes"].append(get_route(case["slides"]["editorPath"], (200, 302, 303, 307, 308), 40))
    first_case = next(iter(fixtures["cases"].values())); missing_uuid = "00000000-0000-4000-8000-000000000000"
    missing_public = "/v/course_" + "0" * 32
    for path, accepted in [(first_case["slides"]["publicPath"], (404,)), (first_case["slides"]["source"]["url"], (401, 404)),
            ("/published/" + first_case["slides"]["publicId"] + "/" + missing_uuid, (404,)), (missing_public, (404,)), (missing_public + "/" + missing_uuid, (404,)),
            ("/app/workspaces/" + first_case["workspaceSlug"] + "/visualizations/" + missing_uuid, (302, 303, 307, 308))]:
        report["warmRoutes"].append(get_route(path, accepted, 40))
    report["warmNegativeRoutesAreAcceptance"] = False
    next_tls_window("before-four-browser-identities"); guard("before-browser")
    remaining = work_end - time.monotonic() - 30
    assert remaining >= 720, "The full unchanged four-identity browser window no longer fits the work budget"
    report["browserBudget"] = {"remainingWorkSeconds": round(remaining, 3), "outerSeconds": min(780, remaining), "perCaseSeconds": 180, "globalSeconds": 720, "scopeReduced": False}
    run([str(browser_tools / "node_modules/.bin/playwright"), "test", "--config", str(browser_tools / "playwright.supabase-application.config.ts")], min(780, remaining), accepted=(0, 1), cwd=app)
    value = read_browser()
    assert report["commands"][-1]["exitCode"] == 0
    verify_browser(value, fixtures)
    next_tls_window("after-four-browser-identities-before-audit-helper")
    restore_journals(); audit = helper("audit")
    assert audit["journals"]["remaining"] == 0 and len(audit["objects"]) == 8 and len(audit["canonical"]) == 4
    report["applicationAudit"] = audit; guard("after-browser")


def telemetry_grace():
    deadline = min(time.monotonic() + 15, cleanup_end - 12)
    waited = []
    while True:
        owned, uncertain = owned_processes(); assert not uncertain
        candidates = []
        for row in owned:
            entry = Path("/proc") / str(row["pid"])
            try:
                fields = process_stat(entry)
                if fields[19] != row["startTime"]: continue
                cwd = os.readlink(entry / "cwd"); argv = (entry / "cmdline").read_bytes().split(b"\0")
                if cwd == str(app) and os.fsencode(str(app / "node_modules/next/dist/telemetry/detached-flush.js")) in argv:
                    candidates.append(row)
                    if row not in waited: waited.append(row)
            except (FileNotFoundError, ProcessLookupError): pass
        if not candidates or time.monotonic() >= deadline: break
        time.sleep(0.1)
    report["nextTelemetryGrace"] = {"secondsLimit": 15, "observed": waited, "remaining": candidates, "signalsDuringGrace": []}
    assert not candidates, "Owned Next telemetry outlived its normal bounded grace"


def interrupted(number, _frame):
    global interruption
    interruption = "Interrupted by signal " + str(number)


signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
try:
    application_main()
    status = 0
except BaseException as error:
    report["error"] = type(error).__name__ + ": " + str(error)
    report["errorLocation"] = [{"file": Path(frame.filename).name, "line": frame.lineno, "function": frame.name} for frame in traceback.extract_tb(error.__traceback__)[-8:]]
finally:
    cleanup_end = time.monotonic() + 90
    # Retain ordinary Playwright failures before applying the independent gates.
    if "playwright" not in report:
        try: read_browser()
        except BaseException as error: report["browserCaptureError"] = type(error).__name__ + ": " + str(error); status = 1
    # A lost seed ACK may still leave the exclusive private fixture file. Inventory
    # its real passwords before any retained diagnostic is emitted.
    if (root / "fixtures.json").exists():
        try: fixture_secrets()
        except BaseException as error: report["fixtureSecretInventoryError"] = type(error).__name__ + ": " + str(error); status = 1
    if stack_ready and (root / "fixtures.json").exists():
        try:
            restore_journals()
            report["journalsRestored"] = True
        except BaseException as error: report["journalCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    else: report["journalsRestored"] = not list(root.glob("collision-*"))
    if "next" in managed:
        try: stop_managed("next")
        except BaseException as error: report["nextCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    if stack_ready and (root / "fixtures.json").exists():
        try:
            final_audit = helper("audit"); report["applicationAuditFinal"] = final_audit
            assert final_audit["journals"]["remaining"] == 0
        except BaseException as error: report["applicationAuditError"] = type(error).__name__ + ": " + str(error); status = 1
    if "proxy" in managed:
        try:
            stop_managed("proxy")
            row = report["managed"]["proxy"]
            _capture, data = capture_file(managed["proxy"]["files"][0])
            proof = json.loads(data); report["httpsProxy"] = proof
            assert proof["requests"] > 0 and proof["active"] == 0 and proof["failures"] == []
        except BaseException as error: report["proxyCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    if stack_ready:
        try: report["runtimeAfterAllAppAndHelperClosure"] = runtime_clients(require_zero=True)
        except BaseException as error: report["runtimeClosureError"] = type(error).__name__ + ": " + str(error); status = 1
    if dns_attempted:
        try: report["dnsRestored"] = restore_dns_if_closed()
        except BaseException as error: report["dnsCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    else: report["dnsRestored"] = True
    if stack_attempted:
        try:
            report["dockerBeforeStop"] = owned_docker(docker_snapshot())
            run([str(cli), "stop", "--no-backup"], 45, cwd=stack)
            remaining = owned_docker(docker_snapshot()); report["dockerAfterStop"] = remaining
            assert not any(remaining.values()), "Owned Docker objects remain after normal stop"
            report["stackRemoved"] = True
        except BaseException as error: report["stackCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    else: report["stackRemoved"] = True
    try:
        for port in [5432, 54321, 54443, 3100]:
            with socket.socket() as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); sock.bind(("127.0.0.1", port))
        report["portsReleased"] = True
    except BaseException as error: report["portCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    owned, uncertain = owned_processes(); report["residualBeforeEscalation"] = owned
    if owned or uncertain:
        status = 1
        for row in owned:
            current, _unknown = owned_processes()
            if row in current:
                try: os.kill(row["pid"], signal.SIGTERM)
                except ProcessLookupError: pass
                report.setdefault("cleanupSignals", []).append({"pid": row["pid"], "startTime": row["startTime"], "signal": "TERM"})
        deadline = min(time.monotonic() + 5, cleanup_end - 8)
        while time.monotonic() < deadline:
            owned, uncertain = owned_processes()
            if not owned: break
            time.sleep(0.1)
    owned, uncertain = owned_processes()
    report["processCleanup"] = {"observed": list(observed.values()), "remaining": owned, "uncertain": uncertain, "originalGroupsAbsent": all(group_absent(pgid) for pgid in groups)}
    if owned or uncertain or not report["processCleanup"]["originalGroupsAbsent"]: status = 1
    if dns_attempted and not report.get("dnsRestored") and not owned and not uncertain:
        try: report["dnsRestored"] = restore_dns_if_closed()
        except BaseException as error: report["dnsCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    try:
        guard("after-cleanup"); check_export(); report["exportUnchanged"] = True
        if "browserToolchain" in report: report["browserToolchain"]["sourceCopiesAndLinksUnchanged"] = True
    except BaseException as error: report["sourceError"] = type(error).__name__ + ": " + str(error); status = 1
    try:
        current = root.lstat(); owner = root / ".owner"; owner_info = owner.lstat()
        safe_root = not root.is_symlink() and (current.st_dev, current.st_ino, current.st_uid) == identity and stat.S_IMODE(current.st_mode) == 0o700
        safe_root = safe_root and stat.S_ISREG(owner_info.st_mode) and not owner.is_symlink() and owner_info.st_uid == os.getuid() and owner_info.st_nlink == 1 and stat.S_IMODE(owner_info.st_mode) == 0o600 and owner.read_text() == nonce
    except (FileNotFoundError, OSError): safe_root = False
    report["scratchIdentityMatches"] = safe_root
    released = all(row["exitObservedAndReaped"] and all(row["pipesEOF"]) and row["originalProcessGroupAbsent"] and not row["forcedDrain"] for row in report["commands"])
    if safe_root and released and not owned and not uncertain and report.get("stackRemoved") is True and report.get("dnsRestored") is True and report["processCleanup"]["originalGroupsAbsent"]: shutil.rmtree(root)
    report["scratchRemoved"] = not root.exists()
    def sanitize(value):
        if isinstance(value, str):
            for secret in sorted(secrets, key=len, reverse=True): value = value.replace(secret, "[REDACTED_LOCAL_CREDENTIAL]")
            value = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_LOCAL_JWT]", value)
            return re.sub(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", "[REDACTED_LOCAL_KEY]", value)
        if isinstance(value, list): return [sanitize(item) for item in value]
        if isinstance(value, dict): return {key: sanitize(item) for key, item in value.items()}
        return value
    credentials_inventoried = not stack_attempted or keys_known
    credentials_inventoried = credentials_inventoried and "fixtureSecretInventoryError" not in report
    if not credentials_inventoried:
        for key in ["playwright", "browserBoundaries"]:
            if key in report: report[key] = {"payloadWithheldReason": "incomplete-local-credential-inventory"}
    for value, raw in raw_captures:
        if not value["complete"] or not credentials_inventoried:
            value.update({"payloadWithheldReason": "incomplete-capture" if not value["complete"] else "incomplete-local-credential-inventory", "sanitizedBytes": 0, "sanitizedSha256": sha(b""), "sanitizedGzipBase64": base64.b64encode(gzip.compress(b"", mtime=0)).decode()})
        else:
            sanitized = raw
            for secret in sorted(secrets, key=len, reverse=True): sanitized = sanitized.replace(secret.encode(), b"[REDACTED_LOCAL_CREDENTIAL]")
            sanitized = re.sub(rb"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", b"[REDACTED_LOCAL_JWT]", sanitized)
            sanitized = re.sub(rb"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", b"[REDACTED_LOCAL_KEY]", sanitized)
            value.update({"sanitization": "byte-preserving-credential-substitution-v1", "sanitizedBytes": len(sanitized), "sanitizedSha256": sha(sanitized), "sanitizedGzipBase64": base64.b64encode(gzip.compress(sanitized, mtime=0)).decode()})
    report["finishedAt"] = time.time(); report["interruption"] = interruption
    browser_proof = report.get("browserToolchain", {})
    report["passed"] = status == 0 and interruption is None and not report.get("exportViolations") and report.get("freshBrowserCasesPassed") == 4 and len(report.get("nextTLSWindows", [])) == 2 and len(report["sourceGuards"]) == 5 and report.get("portsReleased") is True and report.get("stackRemoved") is True and report.get("dnsRestored") is True and report.get("journalsRestored") is True and report["scratchRemoved"] and safe_root and credentials_inventoried and all(value["complete"] for value, _raw in raw_captures) and browser_proof.get("sourceCopiesAndLinksUnchanged") is True and browser_proof.get("focusedTypecheck") is True and browser_proof.get("actualBrowserProbe", {}).get("version") == "158.0.8127.18"
    report["providerCasesExecutedThisAttempt"] = 0
    print("IV_SUPABASE_APPLICATION_RESULT=" + json.dumps(sanitize(report), separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
