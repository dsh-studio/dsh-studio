# DSH Studio Workbench Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic packaging, transactional profile composition, recovery service, and desktop component-management UI required before any third-party DSH workbench plugin is shipped.

**Architecture:** A build-time Node assembler copies reviewed plugin runtime files into a generated digest-locked resource. A focused Rust `workbench` module verifies that resource, stores desired versus active component state, transactionally reconciles only Studio-owned Web-profile entries, and supervises normal/safe-mode launches. A standard DSH client plugin exposes health and controls through narrow Tauri commands.

**Tech Stack:** Node.js 24 built-ins, Rust 2021, Tauri 2, serde/serde_json, sha2, UUID, official DSH Web profiles, React 18, TypeScript 5.6, Vitest 3, tsdown, pnpm 10.

---

## Scope boundary

This plan implements Phase 1 of `docs/superpowers/specs/2026-08-26-dsh-studio-workbench-integration-design.md` and produces working software on its own.

- `dsh-studio-brand`, `dsh-studio-providers`, `dsh-studio-themes`, and the new `dsh-studio-workbench` are required safe-mode components.
- Existing `dsh-studio-skills-panel` is the first optional component and remains enabled by default.
- Better Sidebar, `dsh-at-file`, Agent Teams, ModLens, Browser, TUI, and Market enter through later plans after exact source, version, license, permission, build, and DSH compatibility checks.
- `dsh-web-ui`/`dsh-web-all`, `dsh-memory`, and `dsh-hud` remain excluded.
- Normal startup remains offline. The packaged runtime does not regain npm, pnpm, corepack, or arbitrary lifecycle scripts.

## File map

### Build-time assembly

- Create `spike/workbench/workbench.source.json` — reviewed source manifest and runtime-file allowlists.
- Create `spike/workbench/assemble.mjs` — deterministic copier, tree hasher, lock writer, and license gate.
- Create `spike/workbench/assemble.test.mjs` — Node tests for determinism, allowlists, containment, and symlink rejection.
- Modify `.gitignore` — ignore only `spike/workbench/dist/`.
- Modify `spike/app/package.json`, `spike/app/src-tauri/tauri.conf.json`, and `.github/workflows/build.yml` — assemble and package the generated resource.

### Rust boundary

- Create `spike/app/src-tauri/src/workbench/model.rs` — lock, state, catalog, status, mode, and transaction DTOs.
- Create `spike/app/src-tauri/src/workbench/artifact.rs` — schema, path containment, and digest verification.
- Create `spike/app/src-tauri/src/workbench/state.rs` — atomic desired/active state persistence.
- Create `spike/app/src-tauri/src/workbench/composer.rs` — owned-entry merge, link transaction, snapshot, and rollback.
- Create `spike/app/src-tauri/src/workbench/service.rs` — serialized reconciliation, readiness promotion, rollback, and safe mode.
- Create `spike/app/src-tauri/src/workbench/commands.rs` — narrow Tauri commands and delayed restart scheduling.
- Create `spike/app/src-tauri/src/workbench/mod.rs` and `tests.rs` — module surface and temp-directory tests.
- Modify `spike/app/src-tauri/src/lib.rs` — remove the old provisioner, register service/commands, and supervise host readiness.

### Settings plugin

- Create `spike/plugins/dsh-studio-workbench/` with package metadata, patch, TypeScript sources, tests, and generated client bundle.
- Create `spike/app/src-tauri/permissions/workbench-commands.toml` and `capabilities/workbench-loopback.json`.

### Evidence

- Create `docs/superpowers/verification/2026-08-26-dsh-studio-workbench-foundation.md`.
- Modify `README.md` only after native verification.

## Stable contracts

The command names are exactly:

```text
workbench_catalog
workbench_set_enabled
workbench_repair
workbench_start_safe_mode
```

`component-state.json` keeps `desired` and last-known-good `active` maps separately. A requested change updates `desired`; only a DSH Web readiness signal promotes it to `active`. A failed launch restores the profile transaction and resets `desired` to `active`.

The composer may replace only package and bundle names in the previous Studio-managed record or current embedded lock. Unknown dependencies, bundle rows, fields, sessions, plugin data, and user files are preserved.

## Task 1: Build a deterministic offline workbench artifact

**Files:**
- Create: `spike/workbench/assemble.mjs`
- Create: `spike/workbench/assemble.test.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing tests with real temporary plugin trees**

Create `assemble.test.mjs`:

```js
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { assemble, hashTree } from './assemble.mjs'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-workbench-'))
  const plugin = path.join(root, 'plugin-a')
  await mkdir(path.join(plugin, 'lib'), { recursive: true })
  await writeFile(path.join(plugin, 'package.json'), '{"name":"plugin-a","version":"1.0.0"}\n')
  await writeFile(path.join(plugin, 'cordis.patch.yml'), '- insert: []\n')
  await writeFile(path.join(plugin, 'lib/index.js'), 'export function apply() {}\n')
  await writeFile(path.join(plugin, 'ignored.txt'), 'must not ship\n')
  await writeFile(path.join(root, 'LICENSE'), 'MIT\n')
  const source = {
    schemaVersion: 1,
    components: [{
      id: 'plugin-a', displayName: 'Plugin A', description: 'Fixture plugin',
      package: 'plugin-a', version: '1.0.0', source: 'workspace:plugin-a',
      sourcePath: 'plugin-a', include: ['package.json', 'cordis.patch.yml', 'lib'],
      license: 'MIT', noticeSource: 'LICENSE', profiles: ['web'],
      bundleEntrypoints: ['plugin-a'], defaultEnabled: true, required: false,
      safeMode: false, conflictGroups: [], permissions: ['workspace-read']
    }]
  }
  const sourceFile = path.join(root, 'workbench.source.json')
  await writeFile(sourceFile, JSON.stringify(source))
  return { root, plugin, sourceFile, outputDir: path.join(root, 'dist') }
}

test('copies only allowlisted runtime files and writes matching digest', async () => {
  const f = await fixture()
  const lock = await assemble(f)
  assert.equal(lock.components[0].artifactSha256, await hashTree(path.join(f.outputDir, 'plugins/plugin-a')))
  await assert.rejects(readFile(path.join(f.outputDir, 'plugins/plugin-a/ignored.txt')))
  assert.equal(await readFile(path.join(f.outputDir, 'notices/plugin-a.txt'), 'utf8'), 'MIT\n')
})

test('same tree produces the same lock generation', async () => {
  const f = await fixture()
  assert.deepEqual(await assemble(f), await assemble(f))
})

test('hashTree rejects symlinks', async () => {
  const f = await fixture()
  await symlink(path.join(f.root, 'LICENSE'), path.join(f.plugin, 'lib/escape'))
  await assert.rejects(hashTree(f.plugin), /symlink_not_allowed/)
})

test('missing provenance fails assembly', async () => {
  const f = await fixture()
  const source = JSON.parse(await readFile(f.sourceFile, 'utf8'))
  delete source.components[0].license
  await writeFile(f.sourceFile, JSON.stringify(source))
  await assert.rejects(assemble(f), /invalid_component/)
})
```

- [ ] **Step 2: Run RED**

Run `node --test spike/workbench/assemble.test.mjs`.

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `assemble.mjs`.

- [ ] **Step 3: Implement the assembler with Node built-ins only**

Create `assemble.mjs` with these stable exports and digest algorithm:

```js
import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function fail(code, detail) { throw new Error(`${code}: ${detail}`) }
function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0 }

function relativeInside(root, candidate) {
  const relative = path.relative(root, candidate)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('path_escape', candidate)
  }
  return relative
}

async function filesBelow(root, current = root) {
  const files = []
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries.sort((a, b) => compareText(a.name, b.name))) {
    const absolute = path.join(current, entry.name)
    const metadata = await lstat(absolute)
    if (metadata.isSymbolicLink()) fail('symlink_not_allowed', absolute)
    if (metadata.isDirectory()) files.push(...await filesBelow(root, absolute))
    else if (metadata.isFile()) files.push(absolute)
    else fail('unsupported_file', absolute)
  }
  return files.sort((a, b) => compareText(relativeInside(root, a), relativeInside(root, b)))
}

export async function hashTree(root) {
  const hash = createHash('sha256')
  for (const absolute of await filesBelow(root)) {
    const relative = relativeInside(root, absolute).split(path.sep).join('/')
    const bytes = await readFile(absolute)
    hash.update(relative); hash.update('\0'); hash.update(String(bytes.length)); hash.update('\0'); hash.update(bytes)
  }
  return `sha256:${hash.digest('hex')}`
}

function validate(component) {
  const required = ['id', 'displayName', 'description', 'package', 'version', 'source', 'sourcePath', 'license', 'noticeSource']
  if (required.some((key) => typeof component[key] !== 'string' || component[key].trim() === '')) fail('invalid_component', component.id ?? 'unknown')
  if (!Array.isArray(component.include) || component.include.length === 0) fail('invalid_component', component.id)
  if (!Array.isArray(component.profiles) || !component.profiles.includes('web')) fail('invalid_component', component.id)
  if (!Array.isArray(component.bundleEntrypoints) || component.bundleEntrypoints.length === 0) fail('invalid_component', component.id)
  if (!Array.isArray(component.conflictGroups) || !Array.isArray(component.permissions)) fail('invalid_component', component.id)
  if (typeof component.defaultEnabled !== 'boolean' || typeof component.required !== 'boolean' || typeof component.safeMode !== 'boolean') fail('invalid_component', component.id)
}

async function copyAllowed(sourceRoot, targetRoot, includes) {
  await mkdir(targetRoot, { recursive: true })
  for (const include of includes) {
    const source = path.resolve(sourceRoot, include)
    relativeInside(sourceRoot, source)
    const metadata = await lstat(source)
    if (metadata.isSymbolicLink()) fail('symlink_not_allowed', source)
    const target = path.join(targetRoot, include)
    await mkdir(path.dirname(target), { recursive: true })
    await cp(source, target, { recursive: metadata.isDirectory(), errorOnExist: true, force: false, dereference: false })
  }
  await hashTree(targetRoot)
}

export async function assemble({ sourceFile, outputDir }) {
  const sourceRoot = path.dirname(sourceFile)
  const source = JSON.parse(await readFile(sourceFile, 'utf8'))
  if (source.schemaVersion !== 1 || !Array.isArray(source.components)) fail('invalid_manifest', sourceFile)
  const workspaceRoot = source.workspaceRoot === undefined
    ? sourceRoot
    : path.resolve(sourceRoot, source.workspaceRoot)
  relativeInside(workspaceRoot, sourceRoot)
  const stage = `${outputDir}.stage`
  await rm(stage, { recursive: true, force: true })
  await mkdir(path.join(stage, 'plugins'), { recursive: true })
  await mkdir(path.join(stage, 'notices'), { recursive: true })
  const ids = new Set(), packages = new Set(), locked = []
  for (const component of source.components) {
    validate(component)
    if (ids.has(component.id) || packages.has(component.package)) fail('duplicate_component', component.id)
    ids.add(component.id); packages.add(component.package)
    const sourcePath = path.resolve(sourceRoot, component.sourcePath)
    relativeInside(workspaceRoot, sourcePath)
    const sourceMetadata = await lstat(sourcePath)
    if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isDirectory()) fail('invalid_source_path', component.id)
    const artifactPath = `plugins/${component.package}`
    const targetPath = path.join(stage, artifactPath)
    await copyAllowed(sourcePath, targetPath, component.include)
    const pkg = JSON.parse(await readFile(path.join(targetPath, 'package.json'), 'utf8'))
    if (pkg.name !== component.package || pkg.version !== component.version) fail('package_identity_mismatch', component.id)
    const exportPaths = Object.values(pkg.exports ?? {})
      .filter((value) => typeof value === 'string' && value.startsWith('./'))
    const runtimePaths = [...exportPaths, pkg.dsh?.bundle?.patch]
      .filter((value) => typeof value === 'string' && value.startsWith('./'))
    for (const runtimePath of runtimePaths) {
      const runtimeFile = path.resolve(targetPath, runtimePath)
      relativeInside(targetPath, runtimeFile)
      const runtimeMetadata = await lstat(runtimeFile)
      if (runtimeMetadata.isSymbolicLink() || !runtimeMetadata.isFile()) fail('missing_runtime_entrypoint', runtimePath)
    }
    const noticeName = `${component.id}.txt`
    const noticeSource = path.resolve(sourceRoot, component.noticeSource)
    relativeInside(workspaceRoot, noticeSource)
    const noticeMetadata = await lstat(noticeSource)
    if (noticeMetadata.isSymbolicLink() || !noticeMetadata.isFile()) fail('invalid_notice', component.id)
    await cp(noticeSource, path.join(stage, 'notices', noticeName), { errorOnExist: true, force: false })
    locked.push({
      id: component.id, displayName: component.displayName, description: component.description,
      package: component.package, version: component.version, source: component.source,
      artifactPath, artifactSha256: await hashTree(targetPath), license: component.license,
      notice: `notices/${noticeName}`, profiles: component.profiles,
      bundleEntrypoints: component.bundleEntrypoints, defaultEnabled: component.defaultEnabled,
      required: component.required, safeMode: component.safeMode,
      conflictGroups: component.conflictGroups, permissions: component.permissions
    })
  }
  const generation = createHash('sha256').update(JSON.stringify(locked)).digest('hex')
  const lock = { schemaVersion: 1, generation, components: locked }
  await writeFile(path.join(stage, 'workbench.lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
  await rm(outputDir, { recursive: true, force: true })
  await cp(stage, outputDir, { recursive: true, errorOnExist: true, force: false })
  await rm(stage, { recursive: true, force: true })
  return lock
}

const invoked = process.argv[1] === undefined ? '' : pathToFileURL(path.resolve(process.argv[1])).href
if (import.meta.url === invoked) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  await assemble({ sourceFile: path.join(here, 'workbench.source.json'), outputDir: path.join(here, 'dist') })
}
```

- [ ] **Step 4: Run GREEN and add the ignore rule**

Run `node --test spike/workbench/assemble.test.mjs`.

Expected: 4 tests PASS.

Append:

```gitignore
# Generated by spike/workbench/assemble.mjs
spike/workbench/dist/
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore spike/workbench
git commit -m "build: add deterministic workbench assembler"
```

Confirm generated `spike/workbench/dist/` is not staged.

## Task 2: Define and verify the Rust artifact boundary

**Files:**
- Create: `spike/app/src-tauri/src/workbench/mod.rs`
- Create: `spike/app/src-tauri/src/workbench/model.rs`
- Create: `spike/app/src-tauri/src/workbench/artifact.rs`
- Create: `spike/app/src-tauri/src/workbench/tests.rs`
- Modify: `spike/app/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing lock and conflict tests**

Add tests using real temp artifact files and the production hasher:

```rust
#[test]
fn lock_rejects_duplicate_ids_and_escape_paths() {
    let fixture = ArtifactFixture::new();
    fixture.write_valid_component("component-a", "plugin-a");
    let mut lock = fixture.valid_lock("component-a", "plugin-a");
    lock.components.push(lock.components[0].clone());
    fixture.write_lock(&lock);
    assert_eq!(load_verified_lock(fixture.root()).unwrap_err().code(), "duplicate_component");

    let mut lock = fixture.valid_lock("component-a", "plugin-a");
    lock.components[0].artifact_path = "../outside".into();
    fixture.write_lock(&lock);
    assert_eq!(load_verified_lock(fixture.root()).unwrap_err().code(), "artifact_path_escape");
}

#[test]
fn lock_rejects_tampered_artifact() {
    let fixture = ArtifactFixture::new();
    fixture.write_valid_component("component-a", "plugin-a");
    fixture.write_valid_lock("component-a", "plugin-a");
    std::fs::write(fixture.root().join("plugins/plugin-a/lib/index.js"), "tampered").unwrap();
    assert_eq!(load_verified_lock(fixture.root()).unwrap_err().code(), "artifact_hash_mismatch");
}

#[test]
fn effective_components_enforce_required_safe_mode_and_conflicts() {
    let lock = lock_with_shell_conflict();
    let mut desired = std::collections::BTreeMap::from([
        ("shell-a".into(), true), ("shell-b".into(), true)
    ]);
    assert_eq!(resolve_enabled(&lock, &desired, WorkbenchMode::Normal).unwrap_err().code(), "component_conflict");
    desired.insert("shell-b".into(), false);
    let safe = resolve_enabled(&lock, &desired, WorkbenchMode::Safe).unwrap();
    assert!(safe.iter().all(|item| item.required && item.safe_mode));
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::lock_ -- --nocapture
```

Expected: compilation fails because `workbench` is undefined.

- [ ] **Step 3: Define exact persisted and IPC types**

Create `model.rs`:

```rust
use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};

pub const LOCK_SCHEMA_VERSION: u32 = 1;
pub const STATE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkbenchMode { Normal, Safe }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LockedComponent {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub package: String,
    pub version: String,
    pub source: String,
    pub artifact_path: String,
    pub artifact_sha256: String,
    pub license: String,
    pub notice: String,
    pub profiles: Vec<String>,
    pub bundle_entrypoints: Vec<String>,
    pub default_enabled: bool,
    pub required: bool,
    pub safe_mode: bool,
    pub conflict_groups: Vec<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkbenchLock {
    pub schema_version: u32,
    pub generation: String,
    pub components: Vec<LockedComponent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentState {
    pub schema_version: u32,
    pub desired: BTreeMap<String, bool>,
    pub active: BTreeMap<String, bool>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ComponentHealth { Active, Disabled, SafeModeDisabled, Damaged, Restarting }

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComponentView {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub package: String,
    pub version: String,
    pub source: String,
    pub license: String,
    pub permissions: Vec<String>,
    pub required: bool,
    pub enabled: bool,
    pub effective_enabled: bool,
    pub health: ComponentHealth,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchCatalog {
    pub generation: String,
    pub mode: WorkbenchMode,
    pub rolled_back: bool,
    pub warning: Option<String>,
    pub components: Vec<ComponentView>,
}
```

Define `WorkbenchError { code: &'static str, message: String }` in `mod.rs`, with `code()`, `Display`, and path-free user messages.

- [ ] **Step 4: Implement artifact verification**

`artifact.rs` mirrors the Node digest exactly:

```rust
pub fn hash_tree(root: &Path) -> Result<String, WorkbenchError> {
    use sha2::{Digest, Sha256};
    let mut files = Vec::new();
    collect_regular_files(root, root, &mut files)?;
    files.sort_by_key(|path| normalized_relative(root, path));
    let mut hash = Sha256::new();
    for path in files {
        let relative = normalized_relative(root, &path);
        let bytes = std::fs::read(&path)
            .map_err(|_| WorkbenchError::new("artifact_read_failed", "无法读取组件文件"))?;
        hash.update(relative.as_bytes());
        hash.update([0]);
        hash.update(bytes.len().to_string().as_bytes());
        hash.update([0]);
        hash.update(bytes);
    }
    Ok(format!("sha256:{:x}", hash.finalize()))
}
```

`collect_regular_files` uses `symlink_metadata`, rejects symlinks and special files, and normalizes separators to `/`. Split loading into these exact functions:

```rust
pub fn load_lock_structure(root: &Path) -> Result<WorkbenchLock, WorkbenchError>;
pub fn verify_component_artifact(
    root: &Path,
    component: &LockedComponent,
) -> Result<(), WorkbenchError>;
pub fn load_verified_lock(root: &Path) -> Result<WorkbenchLock, WorkbenchError>;
```

`load_lock_structure` requires schema 1, a 64-lowercase-hex generation, unique IDs/packages, non-empty provenance/license, Web membership, non-empty entrypoints, and contained canonical artifact/notice paths. `verify_component_artifact` checks package name/version and digest. `load_verified_lock` calls both and fails if any component is invalid; Task 5 uses the split functions so optional damage can be represented without discarding the structurally valid catalog.

`resolve_enabled` forces required components on, includes only `required && safe_mode` in safe mode, otherwise uses explicit choices then defaults, and rejects duplicate enabled conflict-group owners before composition.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::lock_ -- --nocapture
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::effective_components -- --nocapture
```

Expected: all focused tests PASS.

Commit:

```bash
git add spike/app/src-tauri/src/workbench spike/app/src-tauri/src/lib.rs
git commit -m "feat: verify locked workbench artifacts"
```

## Task 3: Persist desired and active component state atomically

**Files:**
- Create: `spike/app/src-tauri/src/workbench/state.rs`
- Modify: `spike/app/src-tauri/src/workbench/mod.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`

- [ ] **Step 1: Add failing initialization, promotion, and rollback tests**

```rust
#[test]
fn state_initializes_defaults_without_overwriting_choices() {
    let fixture = WorkbenchFixture::new();
    let store = StateStore::new(fixture.state_root());
    let lock = fixture.lock_with_required_and_optional();
    let mut state = store.load_or_initialize(&lock).unwrap();
    assert_eq!(state.desired["optional"], true);
    assert_eq!(state.active["optional"], true);
    state.desired.insert("optional".into(), false);
    store.save(&state).unwrap();
    let reloaded = store.load_or_initialize(&lock).unwrap();
    assert_eq!(reloaded.desired["optional"], false);
    assert_eq!(reloaded.active["optional"], true);
}

#[test]
fn failed_launch_rolls_desired_back_to_active() {
    let fixture = WorkbenchFixture::new();
    let store = StateStore::new(fixture.state_root());
    let lock = fixture.lock_with_required_and_optional();
    let mut state = store.load_or_initialize(&lock).unwrap();
    state.desired.insert("optional".into(), false);
    store.save(&state).unwrap();
    store.rollback_desired("新组件启动失败，已恢复上一组组件").unwrap();
    let state = store.load_or_initialize(&lock).unwrap();
    assert_eq!(state.desired, state.active);
    assert_eq!(state.warning.as_deref(), Some("新组件启动失败，已恢复上一组组件"));
}

#[test]
fn unreadable_state_is_preserved() {
    let fixture = WorkbenchFixture::new();
    std::fs::create_dir_all(fixture.state_root()).unwrap();
    let path = fixture.state_root().join("component-state.json");
    std::fs::write(&path, b"{broken").unwrap();
    let error = StateStore::new(fixture.state_root())
        .load_or_initialize(&fixture.lock_with_required_and_optional()).unwrap_err();
    assert_eq!(error.code(), "state_unreadable");
    assert_eq!(std::fs::read(path).unwrap(), b"{broken");
}
```

- [ ] **Step 2: Run RED**

Run `cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::state_ -- --nocapture`.

Expected: compilation fails because `StateStore` is undefined.

- [ ] **Step 3: Implement the exact state API**

```rust
pub struct StateStore { root: PathBuf }

impl StateStore {
    pub fn new(root: PathBuf) -> Self;
    pub fn path(&self) -> PathBuf;
    pub fn load_or_initialize(&self, lock: &WorkbenchLock) -> Result<ComponentState, WorkbenchError>;
    pub fn save(&self, state: &ComponentState) -> Result<(), WorkbenchError>;
    pub fn set_desired(&self, lock: &WorkbenchLock, id: &str, enabled: bool) -> Result<ComponentState, WorkbenchError>;
    pub fn promote_desired(&self, lock: &WorkbenchLock) -> Result<ComponentState, WorkbenchError>;
    pub fn rollback_desired(&self, warning: &str) -> Result<ComponentState, WorkbenchError>;
}
```

Initialization gives new IDs their lock default in both maps, forces required IDs true, retains known choices, and retains removed IDs for downgrade safety while catalog/composition ignore them. Unknown IDs and disabling required IDs return `unknown_component` and `required_component`.

`save` writes pretty JSON plus newline to `.component-state.<uuid>.tmp` in the same directory, calls `sync_all`, sets owner-read/write permissions on Unix, renames to `component-state.json`, and best-effort syncs the directory. It never rewrites an unreadable or newer-schema existing file.

`promote_desired` copies desired to active and clears warning. `rollback_desired` copies active to desired and stores a bounded message.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::state_ -- --nocapture
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::failed_launch_ -- --nocapture
```

Expected: all focused tests PASS.

Commit:

```bash
git add spike/app/src-tauri/src/workbench
git commit -m "feat: persist workbench component state"
```

## Task 4: Replace the monolithic provisioner with a transactional composer

**Files:**
- Create: `spike/app/src-tauri/src/workbench/composer.rs`
- Modify: `spike/app/src-tauri/src/workbench/model.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`
- Modify: `spike/app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing preservation, disable, no-op, and rollback tests**

Move the old `provision_merges_new_plugins_into_old_manifest` requirement into the workbench tests and expand it:

```rust
#[test]
fn composer_preserves_user_entries_and_removes_only_managed_entries() {
    let fixture = WorkbenchFixture::new();
    fixture.write_profile(r#"{
      "name":"dsh-profile-web","private":true,
      "dependencies":{"studio-optional":"link:/old","user-extra":"link:/user"},
      "custom":{"keep":true},
      "dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","studio-optional","user-extra"]}}
    }"#);
    fixture.write_managed(&["studio-optional"]);
    let lock = fixture.lock_with_required_and_optional();
    let mut desired = defaults(&lock);
    desired.insert("optional".into(), false);
    let transaction = ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root())
        .compose(&lock, &desired, WorkbenchMode::Normal).unwrap();
    let manifest = fixture.read_profile();
    assert_eq!(manifest["custom"]["keep"], true);
    assert_eq!(manifest["dependencies"]["user-extra"], "link:/user");
    assert!(manifest["dependencies"].get("studio-optional").is_none());
    assert!(transaction.changed);
}

#[test]
fn composer_rolls_back_after_mid_transaction_failure() {
    let fixture = WorkbenchFixture::new();
    fixture.write_existing_optional_profile();
    let before = std::fs::read(fixture.profile_package()).unwrap();
    fixture.inject_link_failure_for("studio-required");
    let lock = fixture.lock_with_required_and_optional();
    let error = ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root())
        .compose(&lock, &defaults(&lock), WorkbenchMode::Normal).unwrap_err();
    assert_eq!(error.code(), "profile_compose_failed");
    assert_eq!(std::fs::read(fixture.profile_package()).unwrap(), before);
    assert!(fixture.profile_node_modules().join("studio-optional").symlink_metadata().is_ok());
}

#[test]
fn explicit_rollback_restores_previous_profile_and_keeps_user_links() {
    let fixture = WorkbenchFixture::new();
    fixture.write_existing_optional_profile();
    let composer = ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root());
    let lock = fixture.lock_with_required_and_optional();
    let mut desired = defaults(&lock);
    desired.insert("optional".into(), false);
    let transaction = composer.compose(&lock, &desired, WorkbenchMode::Normal).unwrap();
    composer.rollback(&transaction.id).unwrap();
    let restored = fixture.read_profile();
    assert!(restored["dependencies"].get("studio-optional").is_some());
    assert_eq!(restored["dependencies"]["user-extra"], "link:/user");
}

#[test]
fn identical_composition_does_not_rewrite_profile() {
    let fixture = WorkbenchFixture::new();
    let composer = ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root());
    let lock = fixture.lock_with_required_and_optional();
    composer.compose(&lock, &defaults(&lock), WorkbenchMode::Normal).unwrap();
    let before = std::fs::metadata(fixture.profile_package()).unwrap().modified().unwrap();
    let second = composer.compose(&lock, &defaults(&lock), WorkbenchMode::Normal).unwrap();
    assert!(!second.changed);
    assert_eq!(std::fs::metadata(fixture.profile_package()).unwrap().modified().unwrap(), before);
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::composer_ -- --nocapture
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::explicit_rollback_ -- --nocapture
```

Expected: compilation fails because `ProfileComposer` is undefined.

- [ ] **Step 3: Add managed-record and transaction types**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedProfileRecord {
    pub generation: String,
    pub packages: Vec<String>,
    pub bundles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompositionTransaction {
    pub id: String,
    pub lock_generation: String,
    pub mode: WorkbenchMode,
    pub changed: bool,
}
```

Persist the active record at `<dsh-home>/profiles/web/.dsh-studio-managed.json`. Store each rollback transaction at `<app-data>/workbench/generations/<uuid>/`:

```text
profile-package.json
managed.json
links/<package-name>
transaction.json
```

- [ ] **Step 4: Implement exact merge and transaction rules**

`ProfileComposer::compose(lock, desired, mode)` performs these ordered operations:

1. `resolve_enabled` before disk mutation.
2. Parse existing package JSON or use the official base/Web skeleton.
3. Load the previous managed record; a missing record is empty, malformed is an error.
4. Remove only previous managed dependency keys and bundle strings.
5. Add enabled packages as `link:<verified absolute artifact path>` and bundle entries in lock order.
6. Retain every unrelated JSON field and array member.
7. Serialize and parse the candidate again.
8. Snapshot package, managed record, and existing managed links into a UUID generation directory.
9. Materialize replacement links under `node_modules/.dsh-studio-stage-<uuid>/`.
10. Move old managed links into the transaction, move staged links to final names, and atomically rename package/managed temp files.
11. On any error, run `rollback(id)` before returning `profile_compose_failed`.

Expose:

```rust
pub struct ProfileComposer { home: PathBuf, assets: PathBuf, state_root: PathBuf }

impl ProfileComposer {
    pub fn new(home: PathBuf, assets: PathBuf, state_root: PathBuf) -> Self;
    pub fn compose(
        &self,
        lock: &WorkbenchLock,
        desired: &BTreeMap<String, bool>,
        mode: WorkbenchMode,
    ) -> Result<CompositionTransaction, WorkbenchError>;
    pub fn rollback(&self, transaction_id: &str) -> Result<(), WorkbenchError>;
    pub fn discard(&self, transaction_id: &str) -> Result<(), WorkbenchError>;
}
```

Before moving or removing any final link, require its name in the previous/current managed union, its parent under the Web profile's `node_modules`, and one unscoped path component. Phase 1 first-party packages are unscoped; reject `/` until Phase 2 adds a tested scoped-package mapper.

Use symlinks on Unix and bounded recursive copy on Windows. Never follow a symlink during copying. `rollback` accepts only a UUID string, never a caller path.

- [ ] **Step 5: Remove the old writer only after GREEN**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::composer_ -- --nocapture
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::explicit_rollback_ -- --nocapture
```

Expected: all composer tests PASS.

Then delete `STUDIO_PLUGINS`, `provision_web_profile`, and its inline test from `lib.rs`. Keep all profile mutation in `composer.rs`.

- [ ] **Step 6: Run full Rust suite and commit**

Run `cargo test --manifest-path spike/app/src-tauri/Cargo.toml`.

Expected: composer plus all existing theme/session/usage tests PASS.

Commit:

```bash
git add spike/app/src-tauri/src/workbench spike/app/src-tauri/src/lib.rs
git commit -m "feat: compose workbench profiles transactionally"
```

## Task 5: Supervise readiness, rollback, and safe-mode recovery

**Files:**
- Create: `spike/app/src-tauri/src/workbench/service.rs`
- Modify: `spike/app/src-tauri/src/workbench/mod.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`
- Modify: `spike/app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing service transition tests with a fake composer port**

```rust
#[test]
fn service_promotes_desired_only_after_ready() {
    let fixture = ServiceFixture::new();
    fixture.service.set_enabled("optional", false).unwrap();
    let launch = fixture.service.prepare_launch(WorkbenchMode::Normal).unwrap();
    assert_eq!(fixture.state().active["optional"], true);
    assert_eq!(fixture.state().desired["optional"], false);
    fixture.service.mark_ready(&launch.id).unwrap();
    assert_eq!(fixture.state().active["optional"], false);
}

#[test]
fn failed_changed_launch_rolls_back_once_then_requests_safe_mode() {
    let fixture = ServiceFixture::new();
    fixture.service.set_enabled("optional", false).unwrap();
    let launch = fixture.service.prepare_launch(WorkbenchMode::Normal).unwrap();
    let recovery = fixture.service.mark_failed(&launch.id, "host exited before ready").unwrap();
    assert_eq!(recovery, RecoveryAction::LaunchSafeMode);
    assert_eq!(fixture.composer.rollback_ids(), vec![launch.transaction_id.unwrap()]);
    assert_eq!(fixture.state().desired, fixture.state().active);
    let safe = fixture.service.prepare_launch(WorkbenchMode::Safe).unwrap();
    assert_eq!(fixture.service.mark_failed(&safe.id, "safe host failed").unwrap(), RecoveryAction::Stop);
}

#[test]
fn catalog_marks_damaged_optional_component_without_hiding_list() {
    let fixture = ServiceFixture::with_damaged_optional();
    let catalog = fixture.service.catalog().unwrap();
    let optional = catalog.components.iter().find(|item| item.id == "optional").unwrap();
    assert!(optional.enabled);
    assert!(!optional.effective_enabled);
    assert_eq!(optional.health, ComponentHealth::Damaged);
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::service_ -- --nocapture
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::failed_changed_ -- --nocapture
```

Expected: compilation fails because `WorkbenchService` and `RecoveryAction` are undefined.

- [ ] **Step 3: Implement serialized service state**

```rust
pub struct WorkbenchService { inner: Mutex<ServiceState> }

struct ServiceState {
    assets_root: PathBuf,
    lock: WorkbenchLock,
    state_store: StateStore,
    composer: ProfileComposer,
    mode: WorkbenchMode,
    pending: Option<PendingLaunch>,
    rolled_back: bool,
    artifact_errors: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryAction { LaunchSafeMode, Stop }

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedLaunch {
    pub id: String,
    pub mode: WorkbenchMode,
    pub transaction_id: Option<String>,
}

impl WorkbenchService {
    pub fn new(assets: PathBuf, home: PathBuf, data: PathBuf) -> Result<Self, WorkbenchError>;
    pub fn catalog(&self) -> Result<WorkbenchCatalog, WorkbenchError>;
    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<WorkbenchCatalog, WorkbenchError>;
    pub fn repair(&self) -> Result<WorkbenchCatalog, WorkbenchError>;
    pub fn prepare_launch(&self, mode: WorkbenchMode) -> Result<PreparedLaunch, WorkbenchError>;
    pub fn mark_ready(&self, launch_id: &str) -> Result<(), WorkbenchError>;
    pub fn mark_failed(&self, launch_id: &str, reason: &str) -> Result<RecoveryAction, WorkbenchError>;
}
```

`new` parses lock structure even if one artifact is damaged and records per-component errors. Required damage returns `required_artifact_damaged`; optional damage is visible and excluded. `prepare_launch` re-verifies, composes, and records one pending UUID plus optional transaction ID. `mark_ready` accepts only the current ID, promotes desired only for normal mode, and clears the warning. `mark_failed` ignores stale IDs, rolls back a changed transaction, resets desired to active, stores a bounded warning, and allows exactly one normal-to-safe recovery. Safe-mode failure returns `Stop`.

- [ ] **Step 4: Eliminate the child-handle race**

Replace `RunningChild(Mutex<Option<Child>>)` with:

```rust
struct RunningProcess { launch_id: String, child: Child }
struct RunningChild(Mutex<Option<RunningProcess>>);
```

All stop/EOF paths take and wait for a child only if launch IDs match. Starting a replacement first stops/waits for the current child, then stores the new process.

Refactor `spawn_web_host` to accept `PreparedLaunch`. Its stdout thread treats the first valid `dsh web: http://127.0.0.1:<port>` as ready, rejects non-loopback hosts, calls `mark_ready` before navigation, and on EOF-before-ready asks `mark_failed`. Only `LaunchSafeMode` schedules one safe launch; safe-mode failure emits one `[fatal]` line and stops.

`start_studio` provisions skills, calls `prepare_launch(Normal)`, and spawns the host. Keep the existing 15-second navigation watchdog.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::service_ -- --nocapture
cargo test --manifest-path spike/app/src-tauri/Cargo.toml
```

Expected: service and full Rust suites PASS.

Commit:

```bash
git add spike/app/src-tauri/src/workbench spike/app/src-tauri/src/lib.rs
git commit -m "feat: recover failed workbench launches safely"
```

## Task 6: Expose narrow desktop workbench commands

**Files:**
- Create: `spike/app/src-tauri/src/workbench/commands.rs`
- Create: `spike/app/src-tauri/permissions/workbench-commands.toml`
- Create: `spike/app/src-tauri/capabilities/workbench-loopback.json`
- Modify: `spike/app/src-tauri/src/workbench/mod.rs`
- Modify: `spike/app/src-tauri/src/lib.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`

- [ ] **Step 1: Add failing command-boundary tests**

```rust
#[test]
fn command_rejects_required_or_unknown_components_without_restart() {
    let fixture = CommandFixture::new();
    assert_eq!(set_enabled(&fixture.service, "required", false).unwrap_err().code(), "required_component");
    assert_eq!(set_enabled(&fixture.service, "missing", true).unwrap_err().code(), "unknown_component");
    assert_eq!(fixture.restart_count(), 0);
}

#[test]
fn valid_toggle_persists_desired_before_restart() {
    let fixture = CommandFixture::new();
    let catalog = set_enabled(&fixture.service, "optional", false).unwrap();
    assert!(!catalog.components.iter().find(|item| item.id == "optional").unwrap().enabled);
    assert_eq!(fixture.state().desired["optional"], false);
}
```

- [ ] **Step 2: Run RED**

Run `cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::command_ -- --nocapture`.

Expected: compilation fails because commands are undefined.

- [ ] **Step 3: Implement exact Tauri wrappers**

```rust
#[tauri::command]
pub fn workbench_catalog(app: AppHandle) -> Result<WorkbenchCatalog, String>;

#[tauri::command]
pub fn workbench_set_enabled(
    app: AppHandle,
    component_id: String,
    enabled: bool,
) -> Result<WorkbenchCatalog, String>;

#[tauri::command]
pub fn workbench_repair(app: AppHandle) -> Result<WorkbenchCatalog, String>;

#[tauri::command]
pub fn workbench_start_safe_mode(app: AppHandle) -> Result<WorkbenchCatalog, String>;
```

Resolve `WorkbenchService` with `try_state`, return `code: Chinese message`, and never return paths. Mutations validate and persist synchronously, return the catalog, then schedule restart after 150 ms so IPC can finish. Repair re-verifies before restart. Safe mode does not change desired choices.

The restart helper stops/waits for the current process, calls `prepare_launch(mode)`, then `spawn_web_host`; it emits a fatal line on preparation failure without looping.

- [ ] **Step 4: Add permission and capability files**

`permissions/workbench-commands.toml`:

```toml
[[permission]]
identifier = "allow-workbench-commands"
description = "Allows the loopback UI to manage only the app-owned workbench composition."
commands.allow = [
  "workbench_catalog",
  "workbench_set_enabled",
  "workbench_repair",
  "workbench_start_safe_mode",
]
```

`capabilities/workbench-loopback.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "workbench-loopback",
  "description": "Workbench-only IPC for the DSH Web host on loopback.",
  "local": false,
  "windows": ["main"],
  "remote": { "urls": ["http://127.0.0.1:*/*"] },
  "permissions": ["allow-workbench-commands"],
  "platforms": ["macOS", "windows"]
}
```

Do not add opener, dialog, shell, or filesystem permissions.

- [ ] **Step 5: Register, test, and commit**

Add all four commands to `tauri::generate_handler!`, then run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::command_ -- --nocapture
cargo check --manifest-path spike/app/src-tauri/Cargo.toml
```

Expected: command tests PASS and Tauri permission generation compiles.

Commit:

```bash
git add spike/app/src-tauri/src/workbench spike/app/src-tauri/src/lib.rs spike/app/src-tauri/permissions/workbench-commands.toml spike/app/src-tauri/capabilities/workbench-loopback.json
git commit -m "feat: expose narrow workbench controls"
```

## Task 7: Build the desktop bridge and component controller

**Files:**
- Create: `spike/plugins/dsh-studio-workbench/package.json`
- Create: `spike/plugins/dsh-studio-workbench/cordis.patch.yml`
- Create: `spike/plugins/dsh-studio-workbench/lib/index.js`
- Create: `spike/plugins/dsh-studio-workbench/src/types.ts`
- Create: `spike/plugins/dsh-studio-workbench/src/bridge.ts`
- Create: `spike/plugins/dsh-studio-workbench/src/controller.ts`
- Create: `spike/plugins/dsh-studio-workbench/tests/setup.ts`
- Create: `spike/plugins/dsh-studio-workbench/tests/bridge.test.ts`
- Create: `spike/plugins/dsh-studio-workbench/tests/controller.test.ts`
- Create: `spike/plugins/dsh-studio-workbench/tsconfig.json`
- Create: `spike/plugins/dsh-studio-workbench/tsdown.config.ts`
- Create: `spike/plugins/dsh-studio-workbench/vitest.config.ts`

- [ ] **Step 1: Write failing bridge and controller tests**

Bridge test:

```ts
it('uses only the four workbench desktop commands', async () => {
  const invoke = vi.fn().mockResolvedValue(catalogFixture())
  ;(window as Window & { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
  const bridge = createWorkbenchBridge()
  await bridge.catalog()
  await bridge.setEnabled('skills-panel', false)
  await bridge.repair()
  await bridge.startSafeMode()
  expect(invoke.mock.calls).toEqual([
    ['workbench_catalog'],
    ['workbench_set_enabled', { componentId: 'skills-panel', enabled: false }],
    ['workbench_repair'],
    ['workbench_start_safe_mode'],
  ])
})
```

Controller test:

```ts
it('keeps the previous catalog visible when a toggle fails', async () => {
  const initial = catalogFixture()
  const bridge = bridgeFixture({
    catalog: initial,
    setEnabledError: new Error('required_component: 核心组件不能关闭'),
  })
  const controller = new WorkbenchController(bridge)
  await controller.load()
  await controller.setEnabled('themes', false)
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready', catalog: initial, pendingComponentId: null,
    error: 'required_component: 核心组件不能关闭',
  })
})
```

Also test load, successful toggle, repair, safe mode, concurrent-action suppression, and disposal of an in-flight result.

- [ ] **Step 2: Run RED**

Run `pnpm --dir spike/plugins --filter dsh-studio-workbench test`.

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Define the exact TypeScript contract**

```ts
export type WorkbenchMode = 'normal' | 'safe'
export type ComponentHealth =
  | 'active' | 'disabled' | 'safeModeDisabled' | 'damaged' | 'restarting'

export interface ComponentView {
  id: string
  displayName: string
  description: string
  package: string
  version: string
  source: string
  license: string
  permissions: string[]
  required: boolean
  enabled: boolean
  effectiveEnabled: boolean
  health: ComponentHealth
}

export interface WorkbenchCatalog {
  generation: string
  mode: WorkbenchMode
  rolledBack: boolean
  warning: string | null
  components: ComponentView[]
}

export interface WorkbenchBridge {
  catalog(): Promise<WorkbenchCatalog>
  setEnabled(componentId: string, enabled: boolean): Promise<WorkbenchCatalog>
  repair(): Promise<WorkbenchCatalog>
  startSafeMode(): Promise<WorkbenchCatalog>
}

export interface WorkbenchSnapshot {
  phase: 'loading' | 'ready' | 'error'
  catalog: WorkbenchCatalog | null
  pendingComponentId: string | null
  pendingGlobalAction: 'repair' | 'safeMode' | null
  error: string | null
}
```

- [ ] **Step 4: Implement bridge and controller**

Use the theme plugin's guarded `window.__TAURI__.core.invoke` pattern. The non-desktop error is exactly `desktop_only: 工作台组件仅在 DSH Studio 桌面应用中可用`.

`WorkbenchController` exposes:

```ts
subscribe(listener: () => void): () => void
getSnapshot(): WorkbenchSnapshot
load(): Promise<void>
setEnabled(componentId: string, enabled: boolean): Promise<void>
repair(): Promise<void>
startSafeMode(): Promise<void>
dispose(): void
```

Follow the theme controller's operation-counter pattern. Mutations keep the previous catalog visible, set one pending field, publish returned catalog on success, and retain the previous catalog with error text on failure. Ignore concurrent actions while a pending field is non-null. Disposal invalidates promises and clears listeners.

- [ ] **Step 5: Add package/build configuration**

`package.json`:

```json
{
  "name": "dsh-studio-workbench",
  "version": "0.1.0",
  "description": "DSH Studio workbench component health and recovery settings",
  "type": "module",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "scripts": { "bundle": "tsdown", "test": "vitest run" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime"],
      "platform": "web"
    }
  }
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: studio-workbench
      name: dsh-studio-workbench
```

`lib/index.js`:

```js
export function apply() {}
```

`tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src", "tests"]
}
```

`tsdown.config.ts`:

```ts
import { clientBundle } from '../tsdown.preset.mjs'
export default clientBundle('dsh-studio-workbench')
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
```

`tests/setup.ts` imports `@testing-library/jest-dom/vitest`, calls Testing Library `cleanup()` after each test, removes the plugin style tag, and deletes the mocked `window.__TAURI__`.

- [ ] **Step 6: Run GREEN, bundle, and commit**

Run:

```bash
pnpm --dir spike/plugins --filter dsh-studio-workbench test
pnpm --dir spike/plugins --filter dsh-studio-workbench bundle
```

Expected: tests PASS and `lib/client.js` has the lazy DSH module-loader wrapper.

Commit:

```bash
git add spike/plugins/dsh-studio-workbench spike/plugins/pnpm-lock.yaml
git commit -m "feat: add workbench desktop bridge"
```

## Task 8: Add the accessible Workbench Components settings page

**Files:**
- Create: `spike/plugins/dsh-studio-workbench/src/WorkbenchSettingsSection.tsx`
- Create: `spike/plugins/dsh-studio-workbench/src/styles.ts`
- Create: `spike/plugins/dsh-studio-workbench/src/client.tsx`
- Create: `spike/plugins/dsh-studio-workbench/tests/client.test.ts`
- Create: `spike/plugins/dsh-studio-workbench/tests/WorkbenchSettingsSection.test.tsx`
- Modify: `spike/plugins/dsh-studio-workbench/tests/setup.ts`

- [ ] **Step 1: Write failing placement and interaction tests**

```ts
it('registers exactly one Workbench Components section', () => {
  const injected: string[] = []
  const registered: Array<Record<string, unknown>> = []
  apply(clientContextFixture(injected, registered))
  expect(injected).toEqual(['settings.section'])
  expect(registered).toHaveLength(1)
  expect(registered[0]).toMatchObject({
    name: 'settings.section', id: 'dsh-studio-workbench', order: 15,
  })
})
```

```tsx
it('shows permissions, protects required components, and toggles optional ones', async () => {
  const user = userEvent.setup()
  const controller = readyControllerFixture()
  render(<WorkbenchSettingsSection controller={controller} />)
  expect(screen.getByRole('heading', { name: '工作台组件' })).toBeVisible()
  expect(screen.getByText('工作区读取')).toBeVisible()
  expect(screen.getByRole('switch', { name: '主题皮肤' })).toBeDisabled()
  await user.click(screen.getByRole('switch', { name: '中文技能面板' }))
  expect(controller.setEnabled).toHaveBeenCalledWith('skills-panel', false)
})

it('shows rollback and damaged-component recovery without hiding the list', async () => {
  const user = userEvent.setup()
  const controller = rolledBackControllerFixture()
  render(<WorkbenchSettingsSection controller={controller} />)
  expect(screen.getByRole('status')).toHaveTextContent('已恢复上一组可用组件')
  expect(screen.getByText('组件文件损坏')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '修复组件' }))
  expect(controller.repair).toHaveBeenCalledOnce()
})
```

Also cover loading, desktop-only error, safe-mode status, pending disabled controls, keyboard activation, and non-color-only status text.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --dir spike/plugins --filter dsh-studio-workbench test -- client.test.ts WorkbenchSettingsSection.test.tsx
```

Expected: FAIL because the section and client do not exist.

- [ ] **Step 3: Implement the UI contract**

Use `useSyncExternalStore(controller.subscribe, controller.getSnapshot)`. Render:

- heading and local/offline explanation;
- `role="status"` warning for rollback/safe mode;
- one row per component with name, description, version, source/license text, permission chips, and text status;
- `<button role="switch" aria-checked>` for optional components;
- disabled switch and `核心组件` label for required components;
- `修复组件` and `以安全模式重启` buttons with confirmation;
- `role="alert"` error text;
- `正在重启本地 DSH…` after a successful mutation.

Use exact mappings and show unknown permissions verbatim:

```ts
const PERMISSION_LABELS: Record<string, string> = {
  'workspace-read': '工作区读取',
  'workspace-write': '工作区写入',
  terminal: '终端执行',
  browser: '浏览器控制',
  network: '网络访问',
  model: '模型调用',
}

const HEALTH_LABELS: Record<ComponentHealth, string> = {
  active: '运行中',
  disabled: '已关闭',
  safeModeDisabled: '安全模式下已停用',
  damaged: '组件文件损坏',
  restarting: '等待重启',
}
```

Render strings as React text only; do not use arbitrary HTML.

- [ ] **Step 4: Register lifecycle and scoped styles**

`client.tsx` constructs bridge/controller in `apply`, loads inside `ctx.effect`, disposes on cleanup, installs/removes one idempotent style tag, and registers only `settings.section` with ID `dsh-studio-workbench`, order 15, label `工作台组件`.

Do not inject into `settings.general.item`; Themes remains the sole appearance owner.

- [ ] **Step 5: Run GREEN, bundle, and commit**

Run:

```bash
pnpm --dir spike/plugins --filter dsh-studio-workbench test
pnpm --dir spike/plugins --filter dsh-studio-workbench bundle
```

Expected: all UI tests PASS and no non-whitelisted runtime import appears.

Commit:

```bash
git add spike/plugins/dsh-studio-workbench
git commit -m "feat: add workbench component settings"
```

## Task 9: Wire the real manifest, packaging, CI, and native verification

**Files:**
- Create: `spike/workbench/workbench.source.json`
- Modify: `spike/app/package.json`
- Modify: `spike/app/src-tauri/tauri.conf.json`
- Modify: `spike/app/src-tauri/src/lib.rs`
- Modify: `.github/workflows/build.yml`
- Modify: `README.md`
- Create: `docs/superpowers/verification/2026-08-26-dsh-studio-workbench-foundation.md`

- [ ] **Step 1: Declare the exact five first-party components**

Write records in bundle order:

| ID | Package | Required | Safe | Default | Permissions |
|---|---|---:|---:|---:|---|
| `brand` | `dsh-studio-brand` | yes | yes | on | none |
| `providers` | `dsh-studio-providers` | yes | yes | on | `model`, `network` |
| `themes` | `dsh-studio-themes` | yes | yes | on | none; theme IPC stays separate |
| `skills-panel` | `dsh-studio-skills-panel` | no | no | on | `workspace-read` |
| `workbench` | `dsh-studio-workbench` | yes | yes | on | none; workbench IPC stays separate |

Write this complete source manifest; array order is bundle order:

```json
{
  "schemaVersion": 1,
  "workspaceRoot": "../..",
  "components": [
    {
      "id": "brand",
      "displayName": "DSH Studio 品牌",
      "description": "DSH Studio 桌面品牌标识",
      "package": "dsh-studio-brand",
      "version": "0.1.0",
      "source": "workspace:spike/plugins/dsh-studio-brand",
      "sourcePath": "../plugins/dsh-studio-brand",
      "include": ["package.json", "cordis.patch.yml", "lib"],
      "license": "MIT",
      "noticeSource": "../../LICENSE",
      "profiles": ["web"],
      "bundleEntrypoints": ["dsh-studio-brand"],
      "defaultEnabled": true,
      "required": true,
      "safeMode": true,
      "conflictGroups": [],
      "permissions": []
    },
    {
      "id": "providers",
      "displayName": "模型供应商",
      "description": "DSH Studio 模型供应商预设",
      "package": "dsh-studio-providers",
      "version": "0.1.0",
      "source": "workspace:spike/plugins/dsh-studio-providers",
      "sourcePath": "../plugins/dsh-studio-providers",
      "include": ["package.json", "cordis.patch.yml", "lib"],
      "license": "MIT",
      "noticeSource": "../../LICENSE",
      "profiles": ["web"],
      "bundleEntrypoints": ["dsh-studio-providers"],
      "defaultEnabled": true,
      "required": true,
      "safeMode": true,
      "conflictGroups": [],
      "permissions": ["model", "network"]
    },
    {
      "id": "themes",
      "displayName": "主题皮肤",
      "description": "DSH Studio 唯一的主题与壁纸引擎",
      "package": "dsh-studio-themes",
      "version": "0.1.0",
      "source": "workspace:spike/plugins/dsh-studio-themes",
      "sourcePath": "../plugins/dsh-studio-themes",
      "include": ["package.json", "cordis.patch.yml", "lib"],
      "license": "MIT",
      "noticeSource": "../../LICENSE",
      "profiles": ["web"],
      "bundleEntrypoints": ["dsh-studio-themes"],
      "defaultEnabled": true,
      "required": true,
      "safeMode": true,
      "conflictGroups": ["theme-engine"],
      "permissions": []
    },
    {
      "id": "skills-panel",
      "displayName": "中文技能面板",
      "description": "新会话建议卡与中文技能管理入口",
      "package": "dsh-studio-skills-panel",
      "version": "0.1.0",
      "source": "workspace:spike/plugins/dsh-studio-skills-panel",
      "sourcePath": "../plugins/dsh-studio-skills-panel",
      "include": ["package.json", "cordis.patch.yml", "lib"],
      "license": "MIT",
      "noticeSource": "../../LICENSE",
      "profiles": ["web"],
      "bundleEntrypoints": ["dsh-studio-skills-panel"],
      "defaultEnabled": true,
      "required": false,
      "safeMode": false,
      "conflictGroups": [],
      "permissions": ["workspace-read"]
    },
    {
      "id": "workbench",
      "displayName": "工作台组件管理",
      "description": "组件状态、修复、回滚与安全模式入口",
      "package": "dsh-studio-workbench",
      "version": "0.1.0",
      "source": "workspace:spike/plugins/dsh-studio-workbench",
      "sourcePath": "../plugins/dsh-studio-workbench",
      "include": ["package.json", "cordis.patch.yml", "lib"],
      "license": "MIT",
      "noticeSource": "../../LICENSE",
      "profiles": ["web"],
      "bundleEntrypoints": ["dsh-studio-workbench"],
      "defaultEnabled": true,
      "required": true,
      "safeMode": true,
      "conflictGroups": [],
      "permissions": []
    }
  ]
}
```

- [ ] **Step 2: Assemble the real resource**

Run:

```bash
node spike/workbench/assemble.mjs
node --test spike/workbench/assemble.test.mjs
```

Expected: ignored `spike/workbench/dist/workbench.lock.json` has five components, digests, and notices; tests PASS.

- [ ] **Step 3: Assemble before development/build and package one resource**

Set app scripts:

```json
{
  "scripts": {
    "workbench:assemble": "node ../workbench/assemble.mjs",
    "dev": "pnpm workbench:assemble && vite",
    "build": "pnpm workbench:assemble && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  }
}
```

Replace four individual plugin resource mappings in `tauri.conf.json` with:

```json
"../../workbench/dist/": "workbench/"
```

Keep runtime, skills, and themes resources unchanged.

Replace `plugins_dir` with `workbench_assets_dir`: env override `DSH_STUDIO_WORKBENCH_DIR`, packaged resource `workbench`, development path `workbench/dist`, probe `workbench.lock.json`. Construct `WorkbenchService` from that root, existing DSH home, and `<app-data>/workbench` before `start_studio`.

- [ ] **Step 4: Add CI assembly gate**

Before Tauri build:

```yaml
      - name: Verify workbench assembly
        shell: bash
        run: |
          node --test spike/workbench/assemble.test.mjs
          node spike/workbench/assemble.mjs
          test -f spike/workbench/dist/workbench.lock.json
```

- [ ] **Step 5: Run the full automated matrix**

```bash
node --test spike/workbench/assemble.test.mjs
pnpm --dir spike/plugins --filter dsh-studio-themes test
pnpm --dir spike/plugins --filter dsh-studio-workbench test
pnpm --dir spike/plugins bundle
cargo test --manifest-path spike/app/src-tauri/Cargo.toml
cargo check --manifest-path spike/app/src-tauri/Cargo.toml
pnpm --dir spike/app build
```

Expected: all commands PASS. The app build regenerates the ignored resource and requires no registry/GitHub request.

- [ ] **Step 6: Verify native happy path with an isolated DSH home**

Use a newly created temporary home, never `spike/dev-home` because it contains real credentials. Verify:

1. DSH listens only on `127.0.0.1`.
2. Settings has exactly one `工作台组件` section.
3. Brand, Providers, Themes, and Workbench are protected core components.
4. Skills Panel can be turned off; host restarts; setting remains off.
5. Existing model/theme/session fixtures in the isolated home remain unchanged.
6. Turning Skills Panel on survives another restart.
7. Theme selection and wallpaper remain correct throughout.

Record commands, address, screenshots, and generation in the verification document.

- [ ] **Step 7: Verify damage isolation, rollback, and safe mode**

Copy the generated resource to a temporary directory and point `DSH_STUDIO_WORKBENCH_DIR` at it. Alter only the temporary optional artifact, request Repair, and verify damaged status, optional exclusion, required component availability, path-redacted warning, and preserved user entries.

For controlled launch failure, add a temporary `cfg(debug_assertions)` test hook that exits the next normal host before readiness. Verify one rollback, desired reset to active, and one safe-mode launch. Remove the hook before staging; committed production code must not contain it.

- [ ] **Step 8: Update docs only from evidence**

Document Workbench Components, safe mode, rollback, offline assembly, and user-profile preservation. Explicitly say ecosystem plugins arrive later; do not claim Better Sidebar, Agent Teams, Browser, TUI, or Market is included.

- [ ] **Step 9: Final verification and commit**

Run:

```bash
git diff --check
git status --short
node --test spike/workbench/assemble.test.mjs
pnpm --dir spike/plugins --filter dsh-studio-workbench test
cargo test --manifest-path spike/app/src-tauri/Cargo.toml
pnpm --dir spike/app build
```

Expected: no whitespace errors; only intended changes; all commands PASS; generated dist and temporary homes remain ignored/untracked.

Commit:

```bash
git add .github/workflows/build.yml README.md spike/app/package.json spike/app/src-tauri/tauri.conf.json spike/app/src-tauri/src spike/app/src-tauri/capabilities spike/app/src-tauri/permissions spike/plugins spike/workbench docs/superpowers/verification/2026-08-26-dsh-studio-workbench-foundation.md
git commit -m "feat: integrate recoverable workbench foundation"
```

Inspect staged files and ensure generated dist, test homes, credential files, and sensitive screenshots are absent.

## Completion gate

Phase 1 is complete only when the verification document proves:

- deterministic lock generation and Rust digest parity;
- no runtime registry/GitHub/package-manager dependency;
- preservation of unrelated profile entries;
- desired state promotion only after host readiness;
- one-shot rollback and safe-mode recovery;
- required-component protection;
- optional-component enable/disable persistence;
- separate narrow workbench IPC capability;
- native UI verification with DSH Studio Themes active;
- full Node, Rust, Vitest, plugin bundle, and Vite build suites passing.

Only then should Phase 2 create immutable integration records for `dsh-better-sidebar`, `dsh-at-file`, and `dsh-agent-teams`.
