# Supabase Storage diagnostic 6

7 November 2026: collection completed, **not provider acceptance**.
[Exact JSON](supabase-storage-diagnostic-6.json): `diagnosticComplete:true`,
`providerAccepted:false`, `passed:false`, zero tests. No mapping, waiver or rerun.

- Source `26a141d06c9ae835fde59548650b6832a77a0e0a`;
  activation `c6ae4b2a1040e5a8275135933d9d34b2fdbfac88`.
- [Run 42328538567](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42328538567),
  [job 128269416897](https://github.com/alvarovillalbaa/intelligent-visualization/actions/runs/42328538567/job/128269416897):
  SUCCESS, 02:18:03–02:19:43 UTC.
- JSON 306,883 bytes, SHA-256
  `0988205dcd19177cfb513f67ae35578705d850527c17936f649804710cbe42e1`.
- Storage image `public.ecr.aws/supabase/storage-api:v1.88.0`, image ID
  `sha256:e20b43aa84a4bbfbce10e2d58bb9b6994d1f3c15bd87e9010a9c0f9c80bb60cc`.

## Actual observations

The immutable race produced one fulfilled write and one `STORAGE_UNAVAILABLE`.
Input A remained exact: 53 bytes, SHA-256
`d61de853733efed8a4cf102b93924fb4883c7e688446e95ae01175e38e1145ec`.
The losing POST reached EOF with HTTP 400 and this 106-byte JSON structure:

```json
{"code":"KeyAlreadyExists","error":"Duplicate","statusCode":"409","message":"The resource already exists"}
```

| Anonymous operation | HTTP | Complete response | Independent service state |
| --- | --- | --- | --- |
| GET raw/authenticated object paths | 400 | `NoSuchKey`, statusCode `404` | Target unchanged |
| GET public object path | 400 | `NoSuchBucket`, statusCode `404` | Target unchanged |
| POST list | 200 | Exact `[]` | Target unchanged |
| POST original text/JSON-type write | 400 | `AccessDenied`, statusCode `403` | Target unchanged; candidate absent |
| DELETE target | 200 | Exact `[]` | Target unchanged |
| Additional binary POST | 400 | `AccessDenied`, statusCode `403` | Target unchanged; candidate absent |

List and DELETE each reached EOF with two bytes `[]`, SHA-256
`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.
After every operation, the target retained 56 bytes and SHA-256
`02014e76fb4c0a9949b6bc7686c5d640c9f1f9b7cb48ef97f8bb8df97632e75a`.
No anonymous response contained its marker; neither write candidate existed.
Both writes reported RLS denial. Decoded, unverified roles were distinct
`anon`/`service_role`. This observed DELETE was a no-op, not a blanket 200 waiver.

## Audit and closure

All 64 clones reached EOF; observers drained without failures. Four initially
absent keys were tracked before writes, finally deleted and verified absent.
Runtime pool/root checks and final object/Auth/runtime-client/test-role counts passed.
All 38 commands exited zero with EOF/reaping/group closure. All 77 sanitized
captures decode/hash-match: 125,015 retained versus 125,428 observed original bytes;
two hashes changed through redaction. Original streams are unretained, not replayable.
No raw JWT/header/key or private response body was retained.
All five source/index guards match 611 Git-verified blobs/modes, 12,649,959 bytes;
vector SHA-256 `54778ac59d7059b8a35545bec27187da67aeeb5b5b660e8e67f5eeb89564ad7a`.
All 282 exports (2,155,522 bytes), frozen lock, 296 QA5 runtime inputs and five prior
failed/nonacceptance receipts remain exact. No cases were carried.
All 51 attributed processes, owned Docker objects, ports and scratch closed normally;
no residuals, uncertain identities, signals or outside-resource removals.
Workflow `409992913` was disabled after terminal status; fresh readback confirmed
`disabled_manually` at 02:20:50 UTC. A reviewed correction and fresh contract run
remain required. Application/hosted Supabase/TLS/Vercel acceptance stays pending.
