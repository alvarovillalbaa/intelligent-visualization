import { createHash, randomBytes, randomUUID } from "node:crypto"
import { constants, type Stats } from "node:fs"
import { lstat, open, readdir, realpath, unlink } from "node:fs/promises"
import path from "node:path"

import { hashSecret } from "@/lib/auth"
import { hasUniqueLegacyTeamNamespace, isOwnedLegacyUploadKey } from "@/lib/legacy-file-access"
import { getPersistenceProvider } from "@/lib/persistence/factory"
import { repository } from "@/lib/repository"
import { createSeedState } from "@/lib/seed"
import { getStorageAdapter } from "@/lib/storage/factory"
import type { AssetRecord, DeckRecord, DeckSource, RepositoryState } from "@/lib/types"
import { slugify } from "@/lib/utils"
import type { PersistenceProvider } from "@/packages/backend-contracts/provider"
import { createSupabaseDatabase } from "@/packages/provider-supabase/database"
import type { PostgresDatabase } from "@/packages/provider-postgres/database"
import type { StorageAdapter } from "@/packages/storage/provider"
import { normalizeStorageKey } from "@/packages/storage/provider"

// Inactive until the provider prerequisite passes and both real factory branches
// are deliberately enabled. No injected database, fetch mapper or test hook.
const CASES = ["course-desktop", "course-narrow", "report-desktop", "report-narrow"] as const
type CaseKey = typeof CASES[number]
const HASH = /^[0-9a-f]{64}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ID = /^[A-Za-z0-9_-]{1,128}$/
const MAX_JSON = 256 * 1024, MAX_OBJECT = 16 * 1024 * 1024
const sourceCommit = process.env.SOURCE_COMMIT ?? ""
const root = process.env.IV_SUPABASE_APPLICATION_ROOT ?? ""
const fixturePath = process.env.IV_SUPABASE_APP_FIXTURES ?? ""
const nonce = process.env.IV_SUPABASE_APPLICATION_NONCE ?? ""
const appOrigin = process.env.IV_SUPABASE_APP_ORIGIN ?? ""

type Proof = { key: string; bytes: number; sha256: string }
type FixtureCase = {
  email: string; password: string; userId: string; teamId: string; teamSlug: string;
  workspaceId: string; workspaceSlug: string; workspaceName: string;
  homeWorkspaceId: string; homeWorkspaceSlug: string; homeWorkspaceName: string; homePath: string;
  slides: { id: string; publicId: string; title: string; publicPath: string; editorPath: string; source: Proof & { url: string } };
  victim: Proof & { url: string; userId: string; teamId: string; teamSlug: string; workspaceId: string; deckId: string };
}
type Fixtures = { schemaVersion: 1; sourceCommit: string; appOrigin: string; cases: Record<CaseKey, FixtureCase> }
type Journal = {
  schemaVersion: 1; sourceCommit: string; caseKey: CaseKey; fixtureSha256: string;
  teamId: string; deckId: string; originalTeamSlug: string; collisionTeamSlug: string;
  versionId: string; originalPublicAssets: AssetRecord[] | null; temporaryAsset: AssetRecord;
}
type ClosableProvider = PersistenceProvider & { close(): Promise<void> }
type TLSProof = { currentRole: string; sessionRole: string; ssl: true; version: string; cipher: string }
class FixtureError extends Error {
  constructor(readonly code: string) { super(code) }
}
function requireThat(value: unknown, code = "FIXTURE_SCOPE_REFUSED"): asserts value {
  if (!value) throw new FixtureError(code)
}
function sha(bytes: Buffer | string) { return createHash("sha256").update(bytes).digest("hex") }
function same(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right) }
function stable(before: Stats, after: Stats) {
  return [before.dev, before.ino, before.uid, before.mode, before.nlink, before.size, before.mtimeMs, before.ctimeMs]
    .every((value, index) => value === [after.dev, after.ino, after.uid, after.mode, after.nlink, after.size, after.mtimeMs, after.ctimeMs][index])
}
let rootIdentity: Stats
async function guardRoot() {
  requireThat(process.env.CI === "true" && process.env.IV_SUPABASE_APPLICATION_CHECKS === "disposable")
  requireThat(process.platform === "linux" && typeof process.getuid === "function" && /^[0-9a-f]{40}$/.test(sourceCommit))
  requireThat(path.isAbsolute(root) && path.dirname(root) === "/tmp" && /^ivsa-[A-Za-z0-9_-]+$/.test(path.basename(root)))
  requireThat(/^[0-9a-f]{32,128}$/.test(nonce) && appOrigin === "http://127.0.0.1:3100")
  const info = await lstat(root)
  requireThat(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o077) === 0 && await realpath(root) === root)
  if (rootIdentity) requireThat(info.dev === rootIdentity.dev && info.ino === rootIdentity.ino && info.uid === rootIdentity.uid)
  rootIdentity ??= info
  const owner = await readOwned(path.join(root, ".owner"), 256, false)
  requireThat(owner.bytes.toString("utf8") === nonce)
}
async function parents(file: string) {
  const relative = path.relative(root, file)
  requireThat(path.isAbsolute(file) && relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative))
  let current = root
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part)
    const info = await lstat(current)
    requireThat(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid!() && await realpath(current) === current)
  }
}
async function readOwned(file: string, maximum = MAX_JSON, privateFile = true) {
  await parents(file)
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    requireThat(before.isFile() && before.uid === process.getuid!() && before.nlink === 1 && before.size <= maximum)
    requireThat((before.mode & (privateFile ? 0o077 : 0o022)) === 0)
    const buffer = Buffer.alloc(maximum + 1), { bytesRead } = await handle.read(buffer, 0, maximum + 1, 0)
    const after = await handle.stat(), named = await lstat(file)
    requireThat(bytesRead === before.size && stable(before, after) && stable(after, named) && !named.isSymbolicLink())
    return { bytes: buffer.subarray(0, bytesRead), info: after }
  } finally { await handle.close() }
}
async function writeExclusive(file: string, value: unknown) {
  await guardRoot(); await parents(file)
  const bytes = Buffer.from(JSON.stringify(value) + "\n")
  requireThat(bytes.length <= MAX_JSON)
  const handle = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
  const written = await readOwned(file)
  requireThat(written.bytes.equals(bytes))
  return written
}
async function removeOwned(file: string, expected: { bytes: Buffer; info: Stats }) {
  await guardRoot()
  const current = await readOwned(file)
  requireThat(stable(expected.info, current.info) && current.bytes.equals(expected.bytes), "JOURNAL_IDENTITY_CHANGED")
  await unlink(file)
  try { await lstat(file); throw new FixtureError("JOURNAL_NOT_REMOVED") } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error
  }
}
function parseJson(bytes: Buffer): unknown { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)) }
function isCase(value: string): value is CaseKey { return CASES.some((key) => key === value) }
function checkedKey(key: string) {
  requireThat(typeof key === "string" && Buffer.byteLength(key) <= 1024 && normalizeStorageKey(key) === key)
  return key
}
function fixtureCase(value: FixtureCase, key: CaseKey) {
  requireThat(object(value) && value.email === `iv-${sourceCommit.slice(0, 12)}-${key}@example.test` && typeof value.password === "string" && value.password.length >= 24)
  requireThat([value.userId, value.teamId, value.workspaceId, value.homeWorkspaceId, value.slides?.id, value.slides?.publicId,
    value.victim?.userId, value.victim?.teamId, value.victim?.workspaceId, value.victim?.deckId].every((id) => typeof id === "string" && ID.test(id)))
  requireThat(/^[a-z0-9-]{1,64}$/.test(value.workspaceSlug) && value.homeWorkspaceSlug === "hq"
    && [value.workspaceName, value.homeWorkspaceName].every((name) => typeof name === "string" && name.length > 0 && name.length <= 128 && !/[\u0000-\u001f\u007f]/.test(name))
    && ID.test(value.teamSlug) && ID.test(value.victim.teamSlug))
  requireThat(value.homePath === `/app/workspaces/${value.homeWorkspaceSlug}`)
  requireThat(key === "report-desktop"
    ? value.workspaceId !== value.homeWorkspaceId && value.workspaceSlug === "secondary-reports" && value.workspaceName === "Secondary reports"
    : value.workspaceId === value.homeWorkspaceId && value.workspaceSlug === value.homeWorkspaceSlug && value.workspaceName === value.homeWorkspaceName)
  requireThat(value.slides.editorPath === `/app/workspaces/${value.workspaceSlug}/decks/${value.slides.id}`)
  requireThat(value.slides.publicPath.startsWith(`/d/${value.teamSlug}/`) && !/[?#]/.test(value.slides.publicPath))
  for (const proof of [value.slides.source, value.victim]) {
    checkedKey(proof.key)
    requireThat(proof.url === `/files/${proof.key}` && HASH.test(proof.sha256) && Number.isSafeInteger(proof.bytes) && proof.bytes > 0 && proof.bytes <= 1024 * 1024)
  }
  requireThat(value.userId !== value.victim.userId && value.teamId !== value.victim.teamId)
}
async function fixtures() {
  await guardRoot(); requireThat(fixturePath !== path.join(root, ".owner") && !path.basename(fixturePath).startsWith("collision-"))
  const record = await readOwned(fixturePath), value = parseJson(record.bytes)
  requireThat(object(value) && value.schemaVersion === 1 && value.sourceCommit === sourceCommit && value.appOrigin === appOrigin && object(value.cases))
  requireThat(same(Object.keys(value.cases).sort(), [...CASES].sort()))
  const result = value as Fixtures
  for (const key of CASES) fixtureCase(result.cases[key], key)
  return { value: result, sha256: sha(record.bytes) }
}
function scopedDeck(state: RepositoryState, current: FixtureCase) {
  const user = state.users.find((row) => row.id === current.userId), team = state.teams.find((row) => row.id === current.teamId)
  const homeWorkspace = state.workspaces.find((row) => row.id === current.homeWorkspaceId)
  const workspace = state.workspaces.find((row) => row.id === current.workspaceId), deck = state.decks.find((row) => row.id === current.slides.id)
  requireThat(user?.email === current.email && user.teamId === team?.id && user.workspaceId === homeWorkspace?.id
    && team?.members.some((row) => row.userId === user.id) && homeWorkspace?.teamId === team.id
    && homeWorkspace.slug === current.homeWorkspaceSlug && homeWorkspace.name === current.homeWorkspaceName
    && workspace?.teamId === team.id && workspace.slug === current.workspaceSlug && workspace.name === current.workspaceName
    && deck?.teamId === team.id && deck.workspaceId === workspace.id && deck.publicId === current.slides.publicId)
  return { user, team, homeWorkspace, workspace, deck }
}
async function proof(storage: StorageAdapter, key: string, maximum = MAX_OBJECT): Promise<Proof> {
  checkedKey(key)
  const result = await storage.get({ key })
  requireThat(result?.body && result.key === key && result.body.length > 0 && result.body.length <= maximum, "OBJECT_PROOF_UNAVAILABLE")
  requireThat(result.sizeBytes === result.body.length && result.contentHash === sha(result.body), "OBJECT_PROOF_MISMATCH")
  return { key, bytes: result.body.length, sha256: sha(result.body) }
}
let database: PostgresDatabase | undefined, provider: ClosableProvider | undefined, storage: StorageAdapter | undefined
async function tlsProof(): Promise<TLSProof> {
  const location = new URL(process.env.SUPABASE_DATABASE_URL ?? "")
  requireThat(location.hostname === "db.abcdefghijklmnopqrst.supabase.co" && location.port === "5432", "DATABASE_SCOPE_REFUSED")
  database ??= createSupabaseDatabase()
  // Raw production connection first: TLS/authentication errors keep their native
  // finite code for the negative probes instead of passing through health errors.
  const row = (await database.query(`SELECT current_user AS current_role, session_user AS session_role,
    current_database() AS database_name, pg_catalog.shobj_description(d.oid, 'pg_database') AS marker,
    s.ssl, s.version, s.cipher FROM pg_catalog.pg_database d
    JOIN pg_catalog.pg_stat_ssl s ON s.pid = pg_backend_pid() WHERE d.datname = current_database()`)).rows[0]
  requireThat(row?.current_role === "iv_runtime" && row.session_role === "iv_runtime" && row.database_name === "postgres"
    && row.marker === `iv-supabase-application-ci:${sourceCommit}` && row.ssl === true
    && typeof row.version === "string" && row.version.startsWith("TLS") && typeof row.cipher === "string" && row.cipher.length > 0, "DATABASE_SCOPE_REFUSED")
  return { currentRole: "iv_runtime", sessionRole: "iv_runtime", ssl: true, version: row.version, cipher: row.cipher }
}
async function selected() {
  await guardRoot()
  requireThat(process.env.PERSISTENCE_PROVIDER === "supabase" && process.env.STORAGE_PROVIDER === "supabase" && process.env.AUTH_PROVIDER === "portable")
  requireThat(!process.env.LOCAL_DATABASE_URL && !process.env.DATABASE_URL && process.env.NEXT_PUBLIC_APP_URL === appOrigin)
  const dbURL = new URL(process.env.SUPABASE_DATABASE_URL ?? ""), apiURL = new URL(process.env.SUPABASE_URL ?? "")
  requireThat(dbURL.hostname === "db.abcdefghijklmnopqrst.supabase.co" && dbURL.port === "5432"
    && apiURL.origin === "https://abcdefghijklmnopqrst.supabase.co:54443" && apiURL.pathname === "/" && !apiURL.search && !apiURL.hash && !apiURL.username && !apiURL.password)
  const ssl = await tlsProof()
  if (!provider) {
    const result = await getPersistenceProvider()
    requireThat("close" in result && typeof result.close === "function", "PRODUCTION_FACTORY_UNAVAILABLE")
    provider = result as ClosableProvider
  }
  requireThat(provider.kind === "supabase" && (await provider.health()).ok, "PRODUCTION_FACTORY_UNAVAILABLE")
  storage ??= await getStorageAdapter()
  requireThat(storage.kind === "supabase" && (await storage.health()).ok, "PRODUCTION_STORAGE_UNAVAILABLE")
  return { provider, storage, ssl }
}
function authoredSource(title: string): DeckSource {
  // Only a static source scaffold is selected; no demo state is installed.
  const source = structuredClone(createSeedState().decks[0].source)
  source.title = title; source.seoTitle = title; source.subtitle = "Authored disposable browser fixture"
  source.summary = "Static content for the selected production factories. No model call."
  source.seoDescription = source.summary; source.brand.sourceUrl = undefined; source.brand.logos = []; delete source.brand.brandKit
  source.theme.displayFont = "system-ui, sans-serif"; source.theme.bodyFont = "system-ui, sans-serif"
  source.cta = { label: "Fixture details", href: "#fixture-details", helperText: "No external navigation" }
  source.leadCapture = { enabled: false, headline: "", description: "", fields: [] }
  source.slides = source.slides.slice(0, 2).map((slide, index) => ({ ...slide, id: `fixture-slide-${index + 1}` }))
  return source
}
async function createActor(key: CaseKey, victim: boolean) {
  const suffix = victim ? `${key}-victim` : key, password = randomBytes(24).toString("base64url")
  const email = `iv-${sourceCommit.slice(0, 12)}-${suffix}@example.test`
  const user = await repository.createUser({ name: `Authored ${suffix}`, email, passwordHash: hashSecret(password), teamName: `Fixture ${sourceCommit.slice(0, 12)} ${suffix}` })
  const dashboard = await repository.getDashboard(user.id)
  requireThat(dashboard && dashboard.sessionUser.id === user.id && dashboard.team.id === user.teamId
    && dashboard.workspace.id === user.workspaceId && dashboard.workspace.slug === "hq")
  const secondary = key === "report-desktop" && !victim
  const workspace = secondary
    ? await repository.createWorkspace(user.id, { name: "Secondary reports", description: "Authored same-team secondary workspace; the actor's primary HQ remains unchanged." })
    : dashboard.workspace
  requireThat(workspace.teamId === dashboard.team.id && (secondary
    ? workspace.id !== dashboard.workspace.id && workspace.slug === "secondary-reports"
    : workspace.id === dashboard.workspace.id))
  const sourceText = `Authored private original for ${suffix}.\n`, title = `Authored Slides ${suffix}`
  const deck = await repository.createDeckFromGeneration(user.id, workspace.id, {
    inputKind: "files", rawText: sourceText, prompt: "Static authored fixture; no model request", themeMode: "brand",
    files: [{ name: "authored-original.txt", type: "text/plain", content: sourceText }],
  }, authoredSource(title))
  const originals = deck.assets.filter((asset) => asset.storageKey?.includes("/sources/"))
  requireThat(originals.length === 1 && originals[0].storageKey)
  return { user, dashboard, workspace, deck, password, original: originals[0] }
}
async function seed() {
  const chosen = await selected()
  await parents(fixturePath)
  try { await lstat(fixturePath); throw new FixtureError("FIXTURES_ALREADY_EXIST") } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error
  }
  await chosen.provider.legacy.withState((state) => requireThat(Object.values(state).every((rows) => Array.isArray(rows) && rows.length === 0), "NONEMPTY_FIXTURE_DATABASE"))
  const document: Fixtures = { schemaVersion: 1, sourceCommit, appOrigin, cases: {} as Record<CaseKey, FixtureCase> }
  for (const key of CASES) {
    await guardRoot()
    const actor = await createActor(key, false), victim = await createActor(key, true)
    const victimKey = `uploads/${slugify(victim.dashboard.team.slug)}/library/authored-victim-${randomUUID()}.txt`
    const victimBytes = Buffer.from(`Private victim library fixture ${key}.\n`)
    await chosen.storage.put({ key: `legacy-slides/${victimKey}`, body: victimBytes, contentType: "text/plain", immutable: true })
    await repository.addAsset(victim.user.id, victim.deck.id, { kind: "document", title: "Private victim fixture", description: "Never shared with the actor", url: `/files/${victimKey}`, storageKey: victimKey, contentType: "text/plain", sizeBytes: victimBytes.length })
    const original = await proof(chosen.storage, `legacy-slides/${actor.original.storageKey}`, 1024 * 1024)
    const victimObject = await proof(chosen.storage, `legacy-slides/${victimKey}`, 1024 * 1024)
    document.cases[key] = {
      email: actor.user.email, password: actor.password, userId: actor.user.id, teamId: actor.user.teamId, teamSlug: actor.dashboard.team.slug,
      workspaceId: actor.workspace.id, workspaceSlug: actor.workspace.slug, workspaceName: actor.workspace.name,
      homeWorkspaceId: actor.dashboard.workspace.id, homeWorkspaceSlug: actor.dashboard.workspace.slug,
      homeWorkspaceName: actor.dashboard.workspace.name, homePath: `/app/workspaces/${actor.dashboard.workspace.slug}`,
      slides: { id: actor.deck.id, publicId: actor.deck.publicId, title: actor.deck.title,
        publicPath: `/d/${actor.dashboard.team.slug}/${actor.deck.slug}`,
        editorPath: `/app/workspaces/${actor.workspace.slug}/decks/${actor.deck.id}`,
        source: { key: actor.original.storageKey!, url: actor.original.url, bytes: original.bytes, sha256: original.sha256 } },
      victim: { userId: victim.user.id, teamId: victim.user.teamId, teamSlug: victim.dashboard.team.slug, workspaceId: victim.dashboard.workspace.id, deckId: victim.deck.id,
        key: victimKey, url: `/files/${victimKey}`, bytes: victimObject.bytes, sha256: victimObject.sha256 },
    }
    fixtureCase(document.cases[key], key)
  }
  const counts = await chosen.provider.legacy.withState((state) => {
    for (const key of CASES) scopedDeck(state, document.cases[key])
    requireThat(state.users.length === 8 && state.teams.length === 8 && state.workspaces.length === 9 && state.decks.length === 8)
    return { users: state.users.length, workspaces: state.workspaces.length, slides: state.decks.length }
  })
  const saved = await writeExclusive(fixturePath, document)
  return { schemaVersion: 1, sourceCommit, command: "seed", cases: CASES, ...counts, fixtureBytes: saved.bytes.length, fixtureSha256: sha(saved.bytes), ssl: chosen.ssl }
}
async function snapshot(key: CaseKey, kind: string, versionId?: string) {
  const chosen = await selected(), loaded = await fixtures(), current = loaded.value.cases[key]
  if (kind === "canonical") {
    requireThat(versionId && UUID.test(versionId))
    await chosen.provider.legacy.withState((state) => { scopedDeck(state, current) })
    const version = await chosen.provider.versions.get(versionId), record = version ? await chosen.provider.visualizations.get(version.visualizationId) : null
    requireThat(version && record && record.workspaceId === `legacy-workspace:${current.workspaceId}`
      && record.teamId === `legacy-team:${current.teamId}` && record.createdBy === `legacy-user:${current.userId}`
      && record.kind === key.split("-")[0] && version.createdBy === `legacy-user:${current.userId}` && version.artifactStorageKey)
    requireThat(UUID.test(record.id) && new RegExp(`^${record.kind}_[0-9a-f]{32}$`).test(record.publicId))
    requireThat(new RegExp(`^canonical-publications/${record.id}/${version.id}/[0-9a-f]{64}\\.json$`).test(version.artifactStorageKey))
    const result = await proof(chosen.storage, version.artifactStorageKey)
    return { versionId: version.id, ...result, publicId: record.publicId, status: version.status }
  }
  requireThat(kind === "slides" && versionId === undefined)
  const deck = await chosen.provider.legacy.withState((state) => {
    const scoped = scopedDeck(state, current)
    requireThat(scoped.team.slug === current.teamSlug && hasUniqueLegacyTeamNamespace(state, scoped.team))
    return structuredClone(scoped.deck)
  })
  requireThat(deck.versions.length <= 16 && deck.assets.length <= 32)
  const versions = []
  for (const version of deck.versions) {
    requireThat(version.artifactStorageKey && version.artifactStorageKey.startsWith(`published/${slugify(deck.publicId)}/${slugify(version.id)}/`))
    const artifact = await proof(chosen.storage, `legacy-slides/${version.artifactStorageKey}`)
    versions.push({ id: version.id, status: version.status, passwordProtected: Boolean(version.passwordHash), artifact: { ...artifact, key: version.artifactStorageKey } })
  }
  const assets = []
  for (const asset of deck.assets) if (asset.storageKey) {
    requireThat(asset.url === `/files/${asset.storageKey}`
      && isOwnedLegacyUploadKey(asset.storageKey, current.teamSlug, deck.id, deck.publicId, true))
    const result = await proof(chosen.storage, `legacy-slides/${checkedKey(asset.storageKey)}`)
    assets.push({ id: asset.id, key: asset.storageKey, url: asset.url, bytes: result.bytes, sha256: result.sha256,
      publicInVersions: deck.versions.filter((version) => version.publicAssets?.some((row) => row.id === asset.id && row.storageKey === asset.storageKey && row.url === asset.url)).map((version) => version.id) })
  }
  return { deck: { id: deck.id, publicId: deck.publicId, slug: deck.slug, publishedVersionId: deck.publishedVersionId ?? null, title: deck.title, passwordProtected: deck.passwordProtected }, versions, assets }
}
function journalPath(key: CaseKey) { return path.join(root, `collision-${key}.json`) }
async function collisionOn(key: CaseKey) {
  const chosen = await selected(), loaded = await fixtures(), current = loaded.value.cases[key]
  let journal: Journal | undefined
  await chosen.provider.legacy.withState(async (state) => {
    await guardRoot()
    const { team, deck } = scopedDeck(state, current), victim = state.teams.find((row) => row.id === current.victim.teamId)
    const victimDeck = state.decks.find((row) => row.id === current.victim.deckId)
    const asset = victimDeck?.assets.find((row) => row.storageKey === current.victim.key && row.url === current.victim.url)
    const version = deck.versions.find((row) => row.id === deck.publishedVersionId && row.status === "published")
    requireThat(team.slug === current.teamSlug && victim?.slug === current.victim.teamSlug && team.slug !== victim.slug
      && victimDeck?.teamId === victim.id && asset && version && deck.assets.length <= 32 && (version.publicAssets?.length ?? 0) <= 32)
    const temporaryAsset = { ...structuredClone(asset), id: `fixture-forged-${randomUUID()}` }
    journal = { schemaVersion: 1, sourceCommit, caseKey: key, fixtureSha256: loaded.sha256, teamId: team.id, deckId: deck.id,
      originalTeamSlug: team.slug, collisionTeamSlug: victim.slug, versionId: version.id,
      originalPublicAssets: version.publicAssets ? structuredClone(version.publicAssets) : null, temporaryAsset }
    await writeExclusive(journalPath(key), journal)
    team.slug = victim.slug; deck.assets.push(temporaryAsset)
    version.publicAssets = [...(version.publicAssets ?? []), structuredClone(temporaryAsset)]
  })
  requireThat(journal)
  return { command: "collision-on", caseKey: key, armed: true, victimKey: current.victim.key, victimUrl: current.victim.url, journalRetained: true }
}
async function collisionOff(key: CaseKey) {
  const chosen = await selected(), loaded = await fixtures(), current = loaded.value.cases[key]
  let saved: Awaited<ReturnType<typeof readOwned>>
  try { saved = await readOwned(journalPath(key)) } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error
    await chosen.provider.legacy.withState((state) => {
      const { team, deck } = scopedDeck(state, current)
      requireThat(team.slug === current.teamSlug && !deck.assets.some((asset) => asset.id.startsWith("fixture-forged-"))
        && !deck.versions.some((version) => version.publicAssets?.some((asset) => asset.id.startsWith("fixture-forged-"))), "COLLISION_STATE_CHANGED")
    })
    return { command: "collision-off", caseKey: key, restored: true, journalAbsent: true }
  }
  const journal = parseJson(saved.bytes) as Journal
  requireThat(object(journal) && journal.schemaVersion === 1 && journal.sourceCommit === sourceCommit && journal.caseKey === key
    && journal.fixtureSha256 === loaded.sha256 && journal.teamId === current.teamId && journal.deckId === current.slides.id
    && journal.originalTeamSlug === current.teamSlug && journal.collisionTeamSlug === current.victim.teamSlug
    && typeof journal.versionId === "string" && ID.test(journal.versionId) && object(journal.temporaryAsset)
    && journal.temporaryAsset.storageKey === current.victim.key && journal.temporaryAsset.url === current.victim.url
    && /^fixture-forged-[0-9a-f-]{36}$/.test(journal.temporaryAsset.id)
    && (journal.originalPublicAssets === null || Array.isArray(journal.originalPublicAssets)))
  await chosen.provider.legacy.withState(async (state) => {
    await guardRoot()
    const { team, deck } = scopedDeck(state, current), version = deck.versions.find((row) => row.id === journal.versionId)
    requireThat(deck.publishedVersionId === journal.versionId && version, "COLLISION_STATE_CHANGED")
    const temporary = deck.assets.filter((row) => row.id === journal.temporaryAsset.id)
    // A pre-commit failure may leave a journal without having changed the row.
    if (team.slug === journal.originalTeamSlug && temporary.length === 0 && same(version.publicAssets ?? null, journal.originalPublicAssets)) return
    requireThat(team.slug === journal.collisionTeamSlug && temporary.length === 1 && same(temporary[0], journal.temporaryAsset)
      && same(version.publicAssets, [...(journal.originalPublicAssets ?? []), journal.temporaryAsset]), "COLLISION_STATE_CHANGED")
    team.slug = journal.originalTeamSlug
    deck.assets = deck.assets.filter((row) => row.id !== journal.temporaryAsset.id)
    if (journal.originalPublicAssets === null) delete version.publicAssets
    else version.publicAssets = structuredClone(journal.originalPublicAssets)
  })
  await removeOwned(journalPath(key), saved)
  return { command: "collision-off", caseKey: key, restored: true, journalRemoved: true }
}
async function audit() {
  const chosen = await selected(), loaded = await fixtures()
  const metadata = await chosen.provider.legacy.withState((state) => {
    for (const key of CASES) scopedDeck(state, loaded.value.cases[key])
    return Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, rows.length]))
  })
  const objects: Proof[] = [], canonical = []
  for (const key of CASES) {
    const current = loaded.value.cases[key]
    for (const item of [current.slides.source, current.victim]) {
      const value = await proof(chosen.storage, `legacy-slides/${item.key}`, 1024 * 1024)
      requireThat(value.bytes === item.bytes && value.sha256 === item.sha256)
      objects.push(value)
    }
    const rows = await chosen.provider.visualizations.listByWorkspace(`legacy-workspace:${current.workspaceId}`, null, 50)
    requireThat(rows.nextCursor === null && rows.items.length <= 8
      && rows.items.every((row) => row.teamId === `legacy-team:${current.teamId}` && row.createdBy === `legacy-user:${current.userId}`))
    canonical.push({ caseKey: key, documents: rows.items.length })
  }
  const journals = (await readdir(root)).filter((name) => /^collision-/.test(name))
  requireThat(journals.length <= 4 && journals.every((name) => CASES.some((key) => name === `collision-${key}.json`)))
  for (const file of journals) await readOwned(path.join(root, file))
  return { schemaVersion: 1, sourceCommit, command: "audit", ssl: chosen.ssl, legacy: metadata, canonical, objects, journals: { remaining: journals.length, cases: journals.map((name) => name.slice(10, -5)) }, secretValuesRetainedInOutput: false }
}
const NEGATIVE_CODES: Record<string, readonly string[]> = {
  "probe-negative-ca": ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT"],
  "probe-negative-san": ["ERR_TLS_CERT_ALTNAME_INVALID"], "probe-negative-password": ["28P01"],
}
async function dispatch() {
  await guardRoot()
  const [command, ...args] = process.argv.slice(2), flags = new Map<string, string>()
  requireThat(args.length % 2 === 0)
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index], value = args[index + 1]
    requireThat(["--case", "--kind", "--version-id"].includes(name) && !flags.has(name) && value && !value.startsWith("--"))
    flags.set(name, value)
  }
  if (Object.hasOwn(NEGATIVE_CODES, command)) {
    requireThat(flags.size === 0)
    let code: unknown
    try { await tlsProof() } catch (error) { code = error && typeof error === "object" && "code" in error ? error.code : null }
    requireThat(typeof code === "string" && NEGATIVE_CODES[command].includes(code), "EXPECTED_PROBE_FAILURE_NOT_OBSERVED")
    return { schemaVersion: 1, sourceCommit, command, expectedFailureObserved: true, code }
  }
  if (command === "probe-positive") { requireThat(flags.size === 0); const chosen = await selected(); return { schemaVersion: 1, sourceCommit, command, productionFactories: true, ssl: chosen.ssl } }
  if (command === "seed") { requireThat(flags.size === 0); return seed() }
  if (command === "audit") { requireThat(flags.size === 0); return audit() }
  const key = flags.get("--case") ?? ""
  requireThat(isCase(key))
  if (command === "snapshot") { requireThat(flags.has("--kind") && (flags.size === 2 || flags.size === 3)); return snapshot(key, flags.get("--kind")!, flags.get("--version-id")) }
  requireThat(flags.size === 1)
  if (command === "collision-on") return collisionOn(key)
  if (command === "collision-off") return collisionOff(key)
  throw new FixtureError("UNKNOWN_FIXTURE_COMMAND")
}
async function main() {
  let result: unknown, error: unknown
  try { result = await dispatch() } catch (caught) { error = caught }
  const closed = await Promise.allSettled([provider?.close(), database?.close()])
  const poolsClosed = closed.every((item) => item.status === "fulfilled")
  if (!poolsClosed && !error) error = new FixtureError("FIXTURE_POOL_CLOSURE_FAILED")
  if (error) {
    const code = error instanceof FixtureError ? error.code : "APPLICATION_FIXTURE_FAILED"
    process.stdout.write(JSON.stringify({ schemaVersion: 1, sourceCommit: /^[0-9a-f]{40}$/.test(sourceCommit) ? sourceCommit : null, passed: false, code, cleanup: { poolsClosed } }) + "\n")
    process.exitCode = 1
  } else process.stdout.write(JSON.stringify(result) + "\n")
}
void main()
