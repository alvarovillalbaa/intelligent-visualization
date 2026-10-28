// Optional offline test runtime. No package installation or disk extraction.
// IV_TEST_ZOD_ENTRY can point here while borrowing a TypeScript/React toolchain.
// Built-in access uses Node 22.3+ process.getBuiltinModule.
const assert = process.getBuiltinModule('node:assert/strict');
const { createHash } = process.getBuiltinModule('node:crypto');
const { readFileSync } = process.getBuiltinModule('node:fs');
const { homedir } = process.getBuiltinModule('node:os');
const path = process.getBuiltinModule('node:path');
const vm = process.getBuiltinModule('node:vm');
const { gunzipSync } = process.getBuiltinModule('node:zlib');

const repository = path.resolve(__dirname, '../..');
const locked = JSON.parse(readFileSync(path.join(repository, 'package-lock.json'), 'utf8')).packages['node_modules/zod'];
assert.equal(locked.version, '4.4.3', 'This offline verification helper targets the current locked Zod version.');
assert.equal(locked.resolved, 'https://registry.npmjs.org/zod/-/zod-4.4.3.tgz');
assert.match(locked.integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
const expected = locked.integrity.slice('sha512-'.length);
const hex = Buffer.from(expected, 'base64').toString('hex');
const cached = path.join(homedir(), '.npm/_cacache/content-v2/sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
const compressed = readFileSync(cached);
assert.ok(compressed.length <= 2 * 1024 * 1024, 'The cached archive must remain bounded.');
assert.equal(createHash('sha512').update(compressed).digest('base64'), expected, 'Cached bytes must match IV package-lock integrity before execution.');
const archive = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
const files = new Map();
const field = (start, length) => archive.toString('utf8', start, start + length).split('\0', 1)[0];

// Read regular tar members into memory; never interpret a path as a disk target.
for (let offset = 0; offset + 512 <= archive.length;) {
  if (archive.subarray(offset, offset + 512).every((byte) => byte === 0)) break;
  const name = field(offset, 100);
  const prefix = field(offset + 345, 155);
  const filename = prefix ? prefix + '/' + name : name;
  const size = Number.parseInt(field(offset + 124, 12).trim(), 8);
  const type = archive[offset + 156];
  assert.ok(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= archive.length, 'Invalid cached tar member bounds.');
  if ((type === 0 || type === 48) && (filename.endsWith('.cjs') || filename === 'package/package.json')) {
    assert.ok(!files.has(filename), 'Duplicate cached tar member.');
    files.set(filename, archive.subarray(offset + 512, offset + 512 + size));
  }
  offset += 512 + Math.ceil(size / 512) * 512;
}
assert.ok(files.has('package/package.json'), 'The cached package must contain its metadata.');
assert.equal(JSON.parse(files.get('package/package.json').toString('utf8')).version, locked.version);
const modules = new Map();

function load(filename) {
  assert.ok(filename.startsWith('package/') && files.has(filename), 'Missing or unsupported cached CommonJS member: ' + filename);
  if (modules.has(filename)) return modules.get(filename).exports;
  const moduleRecord = { exports: {} };
  modules.set(filename, moduleRecord);
  const requireMember = (specifier) => {
    assert.ok(specifier.startsWith('.'), 'The cached Zod runtime must not load external modules.');
    return load(path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier)));
  };
  const source = files.get(filename).toString('utf8');
  const execute = new vm.Script('(function(exports,require,module,__filename,__dirname){\n' + source + '\n})', { filename: 'locked-zod-4.4.3/' + filename }).runInThisContext();
  execute(moduleRecord.exports, requireMember, moduleRecord, filename, path.posix.dirname(filename));
  return moduleRecord.exports;
}

module.exports = load('package/index.cjs');
assert.deepEqual(module.exports.core.version, { major: 4, minor: 4, patch: 3 });
