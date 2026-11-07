import { createHash } from "node:crypto"
import { constants, type Stats } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import path from "node:path"

import { createPostgresDatabase, type PostgresDatabase } from "@/packages/provider-postgres/database"
import { createSupabaseStorageAdapter } from "@/packages/provider-supabase/storage"
import type { StorageAdapter } from "@/packages/storage/provider"

// Collection only. The HTTPS facade maps to the controller-owned HTTP gateway;
// this never enables production factories or declares a provider contract passed.
const sourceCommit = process.env.SOURCE_COMMIT ?? ""
const root = process.env.IV_SUPABASE_CHECK_ROOT ?? ""
const nonce = process.env.IV_SUPABASE_CHECK_NONCE ?? ""
const apiOrigin = process.env.IV_SUPABASE_API_URL ?? ""
const runtimeURL = process.env.IV_SUPABASE_RUNTIME_URL ?? ""
const serviceKey = process.env.IV_SUPABASE_SERVICE_KEY ?? ""
const anonKey = process.env.IV_SUPABASE_ANON_KEY ?? ""
const FACADE = "https://iv-supabase.fixture.invalid"
const BUCKET = "iv-private-checks", BODY_LIMIT = 65536, RESPONSE_LIMIT = 128
const prefix = `provider-storage-diagnostic/${nonce}/`
const marker = `authored-private-marker-${nonce}`
const raceInputs = [Buffer.from(`authored-immutable-A-${nonce}`), Buffer.from(`authored-immutable-B-${nonce}`)]
const ownKeys = new Set<string>()
const jobs = new Set<Promise<void>>(), observerFailures: string[] = []
let rootIdentity: Stats | undefined, database: PostgresDatabase | undefined, service: StorageAdapter | undefined
let phase = "preflight", preflightComplete = false

type ErrorFields = { code?: string | number; error?: string | number; statusCode?: string | number; message?: string | number }
type Observation = {
  ordinal: number; label: string; method: string; path: string; startedAt: number;
  responseAt: number | null; status: number | null; contentType: string | null;
  eof: boolean; bytes: number; sha256: string | null; bodyShape: string | null;
  arrayLength: number | null; objectKeys: string[]; errorFields: ErrorFields;
  duplicateFlag: boolean; containsOwnMarker: boolean; observationError: string | null;
}
const responses: Observation[] = [], responseRows = new WeakMap<Response, Observation>()
class DiagnosticError extends Error { constructor(readonly code: string) { super(code) } }
function requireThat(value: unknown, code = "DIAGNOSTIC_SCOPE_REFUSED"): asserts value { if (!value) throw new DiagnosticError(code) }
function sha(value: Buffer) { return createHash("sha256").update(value).digest("hex") }
function safe(value: unknown) {
  let text = String(value)
  for (const secret of [serviceKey, anonKey, runtimeURL, marker, ...raceInputs.map((bytes) => bytes.toString())]) {
    if (secret) text = text.split(secret).join("[redacted]")
  }
  return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 192)
}
function recordFailure(code: string) { if (observerFailures.length < 32) observerFailures.push(code) }
async function guardRoot() {
  requireThat(process.env.CI === "true" && process.env.IV_SUPABASE_CHECKS === "disposable" && process.platform === "linux")
  requireThat(/^[0-9a-f]{40}$/.test(sourceCommit) && /^[0-9a-f]{32}$/.test(nonce) && typeof process.getuid === "function")
  requireThat(path.isAbsolute(root) && path.dirname(root) === "/tmp" && /^ivsb-[A-Za-z0-9_-]+$/.test(path.basename(root)))
  const info = await lstat(root)
  requireThat(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o077) === 0 && await realpath(root) === root)
  if (rootIdentity) requireThat(info.dev === rootIdentity.dev && info.ino === rootIdentity.ino && info.uid === rootIdentity.uid)
  rootIdentity ??= info
  const file = path.join(root, ".owner"), handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    requireThat(before.isFile() && before.uid === info.uid && before.nlink === 1 && before.size === nonce.length && (before.mode & 0o022) === 0)
    const bytes = Buffer.alloc(129), read = await handle.read(bytes, 0, bytes.length, 0), after = await handle.stat(), named = await lstat(file)
    requireThat(read.bytesRead === nonce.length && bytes.subarray(0, read.bytesRead).toString("utf8") === nonce
      && !named.isSymbolicLink() && [after, named].every((row) => row.dev === before.dev && row.ino === before.ino && row.uid === before.uid
        && row.size === before.size && row.mtimeMs === before.mtimeMs && row.ctimeMs === before.ctimeMs))
  } finally { await handle.close() }
}
async function preflight() {
  await guardRoot()
  requireThat(apiOrigin === "http://127.0.0.1:54321" && serviceKey && anonKey && serviceKey !== anonKey)
  requireThat([serviceKey, anonKey].every((key) => key.length <= 8192 && !/[\s\u0000-\u001f\u007f]/.test(key)))
  const location = new URL(runtimeURL)
  requireThat(["postgres:", "postgresql:"].includes(location.protocol) && location.hostname === "127.0.0.1" && location.port === "54322"
    && location.pathname === "/postgres" && location.username === "iv_runtime" && location.password && !location.search && !location.hash)
  database = createPostgresDatabase({ connectionString: runtimeURL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000, query_timeout: 10000 })
  const row = (await database.query(`SELECT current_user AS current_role,session_user AS session_role,current_database() AS database_name,
    pg_catalog.shobj_description(oid,'pg_database') AS marker FROM pg_catalog.pg_database WHERE datname=current_database()`)).rows[0]
  requireThat(row?.current_role === "iv_runtime" && row.session_role === "iv_runtime" && row.database_name === "postgres"
    && row.marker === `iv-supabase-provider-ci:${sourceCommit}`, "DATABASE_MARKER_REFUSED")
  preflightComplete = true
  return { currentRole: "iv_runtime", sessionRole: "iv_runtime", databaseMarkerMatches: true }
}
function decodedRole(key: string) {
  let role: string | null = null
  try {
    const parts = key.split(".")
    if (parts.length === 3 && parts[1].length <= 8192) {
      const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
      if (payload && typeof payload === "object" && "role" in payload && typeof payload.role === "string") {
        role = ["anon", "service_role", "authenticated"].includes(payload.role) ? payload.role : "other"
      }
    }
  } catch { /* This label is not JWT verification. */ }
  return { role, verification: "decoded-not-verified" }
}
async function readBounded(response: Response, retain: boolean) {
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Buffer[] = [], deadline = Date.now() + 10000
  let size = 0
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const part = await Promise.race([reader.read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DiagnosticError("BODY_TIMEOUT")), Math.max(1, deadline - Date.now()))
      })]).finally(() => clearTimeout(timer))
      if (part.done) break
      size += part.value.byteLength
      requireThat(size <= BODY_LIMIT, "BODY_LIMIT_EXCEEDED")
      if (retain) chunks.push(Buffer.from(part.value))
    }
    return retain ? Buffer.concat(chunks, size) : Buffer.alloc(0)
  } catch (error) { void reader.cancel().catch(() => {}); throw error }
  finally { try { reader.releaseLock() } catch { /* Failure is retained by the caller. */ } }
}
async function observe(response: Response, row: Observation) {
  const bytes = await readBounded(response, true)
  row.eof = true; row.bytes = bytes.length; row.sha256 = sha(bytes)
  row.containsOwnMarker = bytes.includes(Buffer.from(marker))
  if (bytes.length === 0) { row.bodyShape = "empty"; return }
  let value: unknown
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
  catch { row.bodyShape = "non-json"; return }
  if (Array.isArray(value)) { row.bodyShape = "array"; row.arrayLength = value.length; return }
  if (!value || typeof value !== "object") { row.bodyShape = "scalar"; return }
  row.bodyShape = "object"; row.objectKeys = Object.keys(value).slice(0, 16).map(safe)
  const object = value as Record<string, unknown>
  for (const field of ["code", "error", "statusCode", "message"] as const) {
    const selected = object[field]
    if (typeof selected === "string" || typeof selected === "number") row.errorFields[field] = typeof selected === "number" ? selected : safe(selected)
  }
  row.duplicateFlag = [object.code, object.error].some((code) => typeof code === "string"
    && ["KeyAlreadyExists", "ResourceAlreadyExists", "AlreadyExists", "Duplicate", "already_exists"].includes(code))
}
const transport: typeof fetch = (input, init) => {
  requireThat(preflightComplete && !(input instanceof Request), "UNEXPECTED_TRANSPORT_INPUT")
  const url = new URL(String(input))
  requireThat(url.origin === FACADE && url.pathname.startsWith("/storage/v1/") && !url.search && !url.hash && !url.username && !url.password)
  // This is the same explicit facade transport as the service fixtures. The
  // native fetch receives the original init object; no response is fabricated.
  return fetch(apiOrigin + url.pathname, init)
}
function watched(label: string): typeof fetch {
  return (input, init) => {
    requireThat(responses.length < RESPONSE_LIMIT, "OBSERVER_COUNT_EXCEEDED")
    const url = new URL(String(input)), row: Observation = {
      ordinal: responses.length + 1, label, method: (init?.method ?? "GET").toUpperCase(), path: url.pathname,
      startedAt: Date.now(), responseAt: null, status: null, contentType: null, eof: false, bytes: 0, sha256: null,
      bodyShape: null, arrayLength: null, objectKeys: [], errorFields: {}, duplicateFlag: false, containsOwnMarker: false, observationError: null,
    }
    responses.push(row)
    const original = transport(input, init)
    const job = original.then((response) => {
      row.responseAt = Date.now(); row.status = response.status; row.contentType = safe(response.headers.get("content-type") ?? "")
      responseRows.set(response, row)
      return observe(response.clone(), row)
    }).catch((error) => {
      row.observationError = error instanceof DiagnosticError ? error.code : "OBSERVER_FAILED"
      recordFailure(row.observationError)
    }).finally(() => jobs.delete(job))
    jobs.add(job)
    // Return the identical native promise immediately. Observers alone consume
    // clones; the adapter or direct diagnostic caller consumes the original.
    return original
  }
}
function adapter(label: string) {
  return createSupabaseStorageAdapter({ url: FACADE, serviceRoleKey: serviceKey, bucket: BUCKET }, watched(label))
}
async function drain() {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([Promise.allSettled([...jobs]), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DiagnosticError("OBSERVER_DRAIN_TIMEOUT")), 20000)
    })])
    requireThat(jobs.size === 0, "OBSERVERS_REMAIN")
  } finally { clearTimeout(timer) }
}
async function serviceState(key: string, label: string) {
  const value = await adapter(label).get({ key })
  await drain()
  if (!value) return { key, exists: false as const, bytes: 0, sha256: null, metadataMatches: true }
  requireThat(value.body && value.body.length <= BODY_LIMIT, "SERVICE_BODY_UNAVAILABLE")
  const digest = sha(value.body)
  return { key, exists: true as const, bytes: value.body.length, sha256: digest,
    metadataMatches: value.sizeBytes === value.body.length && value.contentHash === digest }
}
function compareTarget(value: Awaited<ReturnType<typeof serviceState>>, positive: Awaited<ReturnType<typeof serviceState>>) {
  return { ...value, unchangedFromPositive: value.exists && positive.exists && value.bytes === positive.bytes && value.sha256 === positive.sha256 }
}
async function anonymous(method: string, pathname: string, body: string | Buffer | undefined, contentType: string, label: string) {
  const response = await watched(label)(FACADE + pathname, {
    method, headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "content-type": contentType },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : new Uint8Array(body) }),
    redirect: "error", signal: AbortSignal.timeout(15000),
  })
  await readBounded(response, false)
  await drain()
  const row = responseRows.get(response)
  requireThat(row?.eof && row.observationError === null, "ANONYMOUS_RESPONSE_INCOMPLETE")
  return { responseOrdinal: row.ordinal, method, path: pathname, requestContentType: contentType, status: row.status, completedAt: Date.now() }
}
function publicOutcome(row: PromiseSettledResult<Awaited<ReturnType<StorageAdapter["put"]>>>) {
  if (row.status === "fulfilled") return { status: "fulfilled", publicErrorCode: null, bytes: row.value.sizeBytes, sha256: safe(row.value.contentHash) }
  const reason: unknown = row.reason
  const code = reason && typeof reason === "object" && "code" in reason && typeof reason.code === "string" ? safe(reason.code) : "UNCLASSIFIED"
  return { status: "rejected", publicErrorCode: code }
}
async function collect(observation: Record<string, unknown>) {
  const identity = await preflight()
  observation.identity = identity
  observation.credentialLabels = { anonymousDistinctFromService: anonKey !== serviceKey, anonymous: decodedRole(anonKey), service: decodedRole(serviceKey) }
  service = adapter("service-control")
  requireThat((await service.health()).ok, "PRIVATE_BUCKET_UNAVAILABLE")
  const target = prefix + "private.txt", race = prefix + "exclusive.txt", originalWrite = prefix + "anonymous.txt", binaryWrite = prefix + "anonymous-binary.bin"
  const initialAbsence: Array<Awaited<ReturnType<typeof serviceState>>> = []
  for (const key of [target, race, originalWrite, binaryWrite]) {
    const before = await serviceState(key, "service-before-write")
    requireThat(!before.exists, "DIAGNOSTIC_KEY_ALREADY_PRESENT")
    initialAbsence.push(before)
  }
  observation.initialAbsence = initialAbsence
  // Track every candidate before the request can commit, including denied-write
  // probes and ambiguous adapter outcomes. Cleanup is exact-key only.
  for (const key of [target, race, originalWrite, binaryWrite]) ownKeys.add(key)
  phase = "positive-control"
  await guardRoot()
  await service.put({ key: target, body: marker, contentType: "text/plain", immutable: true })
  const positiveControl = await serviceState(target, "service-positive-control")
  observation.positiveControl = positiveControl
  requireThat(positiveControl.exists && positiveControl.metadataMatches && positiveControl.sha256 === sha(Buffer.from(marker)), "POSITIVE_CONTROL_MISMATCH")
  phase = "immutable-race"
  const outcomes = await Promise.allSettled([adapter("race-left"), adapter("race-right")].map((selected, index) =>
    selected.put({ key: race, body: raceInputs[index], contentType: "text/plain", immutable: true })))
  const immutableRace: { key: string; outcomes: ReturnType<typeof publicOutcome>[]; winner?: Awaited<ReturnType<typeof serviceState>>;
    inputMatches?: boolean[]; transportResponseOrdinals: number[] } = {
    key: race, outcomes: outcomes.map(publicOutcome),
    transportResponseOrdinals: responses.filter((row) => row.label === "race-left" || row.label === "race-right").map((row) => row.ordinal),
  }
  observation.immutableRace = immutableRace
  await drain()
  const winner = await serviceState(race, "service-race-readback")
  immutableRace.winner = winner
  immutableRace.inputMatches = raceInputs.map((bytes) => winner.exists && winner.sha256 === sha(bytes))
  const operations = [
    { method: "GET", path: `/storage/v1/object/${BUCKET}/${target}`, body: undefined },
    { method: "GET", path: `/storage/v1/object/authenticated/${BUCKET}/${target}`, body: undefined },
    { method: "GET", path: `/storage/v1/object/public/${BUCKET}/${target}`, body: undefined },
    { method: "POST", path: `/storage/v1/object/list/${BUCKET}`, body: JSON.stringify({ prefix }) },
    { method: "POST", path: `/storage/v1/object/${BUCKET}/${originalWrite}`, body: "denied" },
    { method: "DELETE", path: `/storage/v1/object/${BUCKET}`, body: JSON.stringify({ prefixes: [target] }) },
  ]
  const anonymousOperations: Array<Record<string, unknown>> = []
  observation.anonymousOperations = anonymousOperations
  for (const [index, operation] of operations.entries()) {
    phase = `anonymous-${index + 1}`
    const response = await anonymous(operation.method, operation.path, operation.body, "application/json", phase)
    // Keep the exact original six probes, including the original non-JSON text
    // uploaded with application/json. Status/authorization interpretation waits
    // for the observed response and independent object state below.
    const targetAfter = compareTarget(await serviceState(target, `service-target-after-${index + 1}`), positiveControl)
    const anonymousWriteAfter = index === 4 ? await serviceState(originalWrite, "service-original-write-probe") : null
    anonymousOperations.push({ ...response, targetAfter, anonymousWriteAfter })
  }
  phase = "well-formed-unauthenticated-write"
  const extra = await anonymous("POST", `/storage/v1/object/${BUCKET}/${binaryWrite}`,
    Buffer.from("authored-binary-unauthorized-write"), "application/octet-stream", "anonymous-binary-write")
  const wellFormedUnauthenticatedWrite = { ...extra,
    targetAfter: compareTarget(await serviceState(target, "service-target-after-binary-write"), positiveControl),
    anonymousWriteAfter: await serviceState(binaryWrite, "service-binary-write-probe") }
  observation.wellFormedUnauthenticatedWrite = wellFormedUnauthenticatedWrite
}
async function main() {
  const errors: string[] = [], cleanupFailures: string[] = [], remainingKeys: string[] = [], checkedAbsent: string[] = []
  const observation: Record<string, unknown> = {}
  let rootIdentityVerified = false, poolClosed = false, failurePhase: string | null = null
  try { await collect(observation) } catch (error) {
    failurePhase = phase
    errors.push(error instanceof DiagnosticError ? error.code : "DIAGNOSTIC_COLLECTION_FAILED")
  }
  phase = "cleanup"
  try { await guardRoot(); rootIdentityVerified = true } catch { cleanupFailures.push("ROOT_IDENTITY_UNVERIFIED") }
  if (preflightComplete && rootIdentityVerified && service) {
    for (const key of ownKeys) {
      try {
        requireThat(key.startsWith(prefix) && key.length <= 1024, "CLEANUP_KEY_SCOPE_REFUSED")
        await service.delete({ key })
        const after = await serviceState(key, "service-cleanup-absence")
        if (after.exists) { remainingKeys.push(key); cleanupFailures.push("OWNED_OBJECT_REMAINS") }
        else checkedAbsent.push(key)
      } catch { remainingKeys.push(key); cleanupFailures.push("OWNED_OBJECT_CLEANUP_UNVERIFIED") }
    }
  } else if (ownKeys.size) cleanupFailures.push("OWNED_OBJECT_CLEANUP_REFUSED")
  try { await drain() } catch { cleanupFailures.push("OBSERVER_DRAIN_FAILED") }
  try { await database?.close(); poolClosed = true } catch { cleanupFailures.push("DATABASE_POOL_CLOSURE_FAILED") }
  const allEOF = responses.every((row) => row.eof && row.observationError === null)
  const result = {
    schemaVersion: 1, sourceCommit: /^[0-9a-f]{40}$/.test(sourceCommit) ? sourceCommit : null,
    testsExecuted: 0, providerAccepted: false, passed: false,
    diagnosticComplete: errors.length === 0 && cleanupFailures.length === 0 && preflightComplete && rootIdentityVerified && poolClosed
      && jobs.size === 0 && observerFailures.length === 0 && allEOF && checkedAbsent.length === ownKeys.size,
    ...observation, responses, observer: { pendingJobs: jobs.size, allEOF, failures: observerFailures },
    cleanup: { trackedKeys: [...ownKeys], checkedAbsent, remainingKeys, poolClosed, rootIdentityVerified, failures: cleanupFailures }, errors, failurePhase,
    limits: { responseBytes: BODY_LIMIT, responseCount: RESPONSE_LIMIT, fixtureTransport: "fixed-HTTPS-facade-to-owned-loopback-HTTP",
      jwtLabels: "decoded-not-verified", responseBodiesRetained: false, interpretation: "Observed responses and state only; no authorization/error-code outcome is accepted as a test pass." },
  }
  const encoded = JSON.stringify(result)
  if (Buffer.byteLength(encoded) > 262144) {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, sourceCommit: /^[0-9a-f]{40}$/.test(sourceCommit) ? sourceCommit : null,
      testsExecuted: 0, providerAccepted: false, passed: false, diagnosticComplete: false, errors: ["REPORT_LIMIT_EXCEEDED"] }) + "\n")
    process.exitCode = 1
  } else {
    process.stdout.write(encoded + "\n")
    process.exitCode = result.diagnosticComplete ? 0 : 1
  }
}
void main().catch(() => {
  process.stdout.write(JSON.stringify({ schemaVersion: 1, testsExecuted: 0, providerAccepted: false, passed: false, diagnosticComplete: false, errors: ["DIAGNOSTIC_FINALIZATION_FAILED"], phase }) + "\n")
  process.exitCode = 1
})
