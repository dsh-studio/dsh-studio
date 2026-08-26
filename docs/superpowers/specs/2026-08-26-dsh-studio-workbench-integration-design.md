# DSH Studio Curated Workbench Integration Design

**Date:** 2026-08-26

**Status:** User-approved design

**Initial target:** Personal, local-only macOS installation

**Host application:** DSH Studio

## 1. Summary

DSH Studio will assemble a curated local workbench from selected DeepSeek Harness ecosystem plugins. It will remain a Tauri desktop shell around the bundled official DSH runtime and the loopback-only Web profile; it will not become a separate replacement Web application.

The first release integrates a small, pinned set of plugins with explicit ownership boundaries:

- DSH Studio Themes remains the only global theme and wallpaper engine.
- `dsh-better-sidebar` is the only workbench/sidebar shell.
- Feature plugins register capabilities through supported DSH/Cordis interfaces.
- `dsh-TUI` runs in a separate profile and a real terminal, not inside the Web view.
- `dsh-web-ui`/`dsh-web` is not installed as an aggregate bundle because it overlaps with the chosen shell, theme system, marketplace, and several feature plugins.
- Ambiguous same-name projects, currently `dsh-memory` and `dsh-hud`, are excluded until an exact source is selected.

DSH Studio will package verified, prebuilt plugin artifacts with the application. Runtime startup must not depend on npm, pnpm, GitHub, or arbitrary install scripts. Profile changes are merged transactionally and can be rolled back.

## 2. Goals

1. Provide a useful, already-assembled local DSH workbench after installing DSH Studio.
2. Preserve DSH Studio's existing theme implementation and avoid duplicate global UI owners.
3. Preserve user settings, conversations, profiles, and independently installed plugins across application upgrades.
4. Allow individual components to be enabled, disabled, diagnosed, and isolated without preventing Studio startup.
5. Keep normal startup offline and deterministic.
6. Pin every bundled third-party artifact to a reviewed source and immutable version or commit.
7. Provide a safe-mode path and automatic rollback when composition or startup validation fails.

## 3. Non-goals for the Initial Release

- Hosting DSH Studio for other users or binding DSH to a public/network interface.
- Multi-user authentication, tenancy, quotas, or remote administration.
- Installing the complete `dsh-web-ui`/`dsh-web-all` aggregate.
- Replacing the current DSH Studio Themes implementation with an external Skin Center.
- Embedding a terminal emulator that pretends to be `dsh-TUI`; TUI requires a real TTY.
- Enabling unrestricted marketplace installation or third-party lifecycle scripts at runtime.
- Bundling an unspecified `dsh-memory` or `dsh-hud` implementation.
- Forking the official DSH runtime or copying plugin source into long-lived Studio forks.
- Making Windows support a blocker for the first personal macOS release. The architecture should avoid needless platform coupling so Windows can follow later.

## 4. Approaches Considered

### 4.1 Curated, application-bundled workbench — selected

DSH Studio owns a reviewed lock manifest, builds or acquires pinned plugin artifacts during the application build, packages those artifacts as read-only resources, and composes them into the local Web profile at startup.

This approach gives the personal desktop build a predictable experience without requiring a package manager in the trimmed runtime. It also provides a clear place to enforce theme, shell, permission, and compatibility policy.

### 4.2 Marketplace-first runtime installation — deferred

Letting the marketplace install everything directly is more flexible, but the current packaged runtime intentionally removes npm, npx, and corepack. Restoring a runtime package manager would also permit dependency resolution and lifecycle scripts on the user's machine and would make startup less deterministic.

The marketplace can be added later behind an explicit installer service, but it is not the foundation of the workbench.

### 4.3 Vendor and deeply fork every plugin — rejected

Copying and modifying all plugin sources would give maximum control but would create continuous upstream merge, provenance, and licensing work. Studio should prefer adapters, configuration, and narrow compatibility patches. A fork is a last resort for a confirmed blocking incompatibility and requires a separately documented decision.

## 5. Existing Host Architecture

DSH Studio already:

- launches a bundled Node runtime and official DSH package from Tauri;
- provisions a local Web profile under the Studio-owned DSH home;
- starts the DSH Web service on `127.0.0.1` and loads it into the desktop WebView;
- merges Studio-owned plugin dependencies and bundle entries into the profile instead of replacing the complete manifest;
- ships Studio plugins as application resources and links or copies them into the profile;
- owns theme catalog persistence and rendering through the `dsh-studio-themes` plugin and a narrow Tauri bridge.

The workbench design extends this path. It does not introduce another frontend server or another desktop shell.

## 6. Target Architecture

### 6.1 Layers

```text
DSH Studio Tauri shell
  ├─ bundled Node + official DSH runtime
  ├─ Studio services
  │    ├─ workbench manifest reader
  │    ├─ transactional profile composer
  │    ├─ component health/state service
  │    └─ theme and optional browser-engine bridges
  ├─ read-only application resources
  │    ├─ Studio-owned plugins and themes
  │    └─ pinned, prebuilt ecosystem plugins
  └─ Studio-owned DSH home
       ├─ Web profile
       ├─ optional TUI profile
       ├─ user-installed plugins and configuration
       └─ workbench state, snapshots, and diagnostics
```

The Tauri shell owns process lifecycle, filesystem mutations, native dialogs, and terminal launching. Web plugins receive only the DSH/Cordis and narrowly scoped Tauri capabilities needed for their role.

### 6.2 Build-time workbench assembler

A build-time assembler consumes `workbench.lock.json`. For each component it must:

1. obtain the exact pinned source or package;
2. verify the declared SHA-256 digest;
3. verify that license and redistribution evidence is present;
4. install dependencies and run the plugin's documented build in an isolated build workspace;
5. reject undeclared generated files or unexpected executable entry points;
6. run compatibility smoke tests against the bundled DSH version;
7. copy only the required runtime artifact and required notices into application resources.

The application bundle must contain the resolved artifact. Normal Studio startup never repeats these network or package-manager steps.

### 6.3 Runtime workbench manager

The runtime manager reads the embedded lock manifest and local component state. It computes the desired Web and TUI profile composition, then asks the transactional composer to reconcile only Studio-owned entries.

It exposes a narrow model to the settings UI:

- component identity and display name;
- bundled and active versions;
- enabled state;
- required configuration state;
- health status and last startup error;
- declared permissions;
- compatibility and update status;
- available repair, enable, disable, and configuration actions.

The manager must not expose a generic shell command, arbitrary filesystem write, or arbitrary package installer to the loopback page.

### 6.4 Transactional profile composer

The composer owns only dependencies and bundle entries declared as Studio-managed in the embedded manifest. Reconciliation follows this sequence:

1. lock the target profile against concurrent Studio composition;
2. read and validate the existing profile manifest;
3. copy it and relevant Studio-managed link metadata into a timestamped staging area;
4. merge the desired Studio-managed entries while retaining all unrelated dependencies, bundles, and user configuration;
5. materialize links or platform-safe copies for enabled components;
6. validate JSON, bundle ordering, entrypoint existence, and pinned artifact hashes;
7. start a bounded validation launch or load check against the staged result;
8. atomically replace the managed manifest and link set only after validation succeeds;
9. record the successful generation and retain the previous known-good snapshot.

If any step fails, the current profile remains active. If failure is detected only after process launch, Studio restores the last known-good generation and retries once in safe mode.

The composer must never replace the entire profile directory and must never delete unknown dependencies, bundles, plugin state, conversations, or user files.

### 6.5 Ownership and conflict policy

Global extension points have one owner:

| Extension point | Owner | Policy |
|---|---|---|
| Global theme, tokens, wallpaper | DSH Studio Themes | External Skin Center and theme injectors are excluded |
| Workbench sidebar and layout | `dsh-better-sidebar` | A second sidebar/workbench shell may not mount concurrently |
| Desktop/process/profile lifecycle | DSH Studio Tauri core | Web plugins cannot launch arbitrary processes directly |
| Plugin catalog and future installation | DSH Studio workbench manager | `dsh-market` UI may request actions through a policy service only |
| Official conversation/runtime semantics | Official DSH runtime | Studio adapters must not fork or replace the runtime contract |

Where a third-party package contains an overlapping module, the overlapping module must be disabled through supported configuration or the package is excluded. Studio will not rely on CSS hiding to resolve two active global owners.

## 7. Curated Component Set

| Component | Initial inclusion | Default | Role and boundary |
|---|---|---:|---|
| `dsh-better-sidebar` | Bundled | On | Sole workbench shell: files, editor/previews, terminal, Git, embedded page, and background-task surfaces |
| `dsh-at-file` | Bundled | On | `@file` search and reference in the composer; file expansion remains subject to host workspace and permission policy |
| `dsh-agent-teams` | Bundled | On | Agent-team creation, tasks, and live team status; it does not own the global shell |
| `modlens` | Bundled | Off | Image understanding; enabled only after a compatible model/provider is configured |
| `dsh-browser` | Bundled plugin code | Off | Agent browser automation; separate from the sidebar's human-facing embedded browser |
| `dsh-TUI` | Bundled or pinned profile dependency | Off | Separate TUI profile launched in a real terminal; never mounted into the Web page |
| `dsh-market` | Phase 4 | Off | Initially catalog and compatibility information only; mutation requires the later installer service |
| `dsh-web-ui` / `dsh-web-all` | Not installed | — | Aggregate overlaps with selected owners; individual non-conflicting capabilities can be evaluated separately |
| `dsh-memory` | Excluded | — | Multiple same-name projects; no source selected |
| `dsh-hud` | Excluded | — | Multiple same-name projects; no source selected |

The repository coordinates above are design inputs, not permission to ship them. Before implementation pins a source, it must verify the exact repository/package, current entrypoint, license, transitive license obligations, supported DSH version, platform behavior, and artifact integrity.

## 8. Manifest and Local State

### 8.1 Embedded `workbench.lock.json`

The lock file is reviewed source code and is immutable at runtime. Each component record includes at least:

```json
{
  "schemaVersion": 1,
  "components": [
    {
      "id": "better-sidebar",
      "displayName": "Better Sidebar",
      "source": "https://github.com/OWNER/REPOSITORY",
      "package": "resolved-package-name",
      "version": "resolved-version",
      "commit": "full-commit-sha",
      "artifactSha256": "sha256:...",
      "license": "verified-SPDX-or-reviewed-grant",
      "notice": "notices/better-sidebar.txt",
      "profiles": ["web"],
      "bundleEntrypoints": ["resolved-package-name"],
      "defaultEnabled": true,
      "conflictGroups": ["workbench-shell"],
      "permissions": ["workspace-read", "workspace-write", "terminal"],
      "configuration": []
    }
  ]
}
```

Placeholders shown above may not survive into a release artifact. Missing provenance, digest, license evidence, or compatibility evidence is a build failure.

### 8.2 Mutable component state

Mutable state lives in the platform application-data directory, separate from the embedded lock:

```text
workbench/
  component-state.json
  generations/
    <generation-id>/
      manifest.json
      profile-package.json
      managed-links.json
      validation.json
  diagnostics/
    latest-startup.json
```

`component-state.json` stores only user choices and schema-controlled component settings. It does not duplicate plugin secrets. Provider keys and other secrets continue to use their existing protected configuration owner.

Writes use staging plus atomic rename. Unknown fields or a newer unsupported schema cause a non-destructive fallback to the last readable state.

## 9. Main Flows

### 9.1 First launch

1. Studio validates the embedded workbench manifest and artifacts.
2. Existing DSH home and Web profile are discovered; none are overwritten wholesale.
3. Default states are initialized for components that do not already have user choices.
4. The composer creates and validates the first managed generation.
5. DSH starts on loopback.
6. The workbench manager reports component health after plugins register.

A new personal installation therefore starts with Better Sidebar, `@file`, and Agent Teams enabled. Model-, browser-engine-, terminal-, or marketplace-dependent capabilities remain off until requested.

### 9.2 Normal launch

Normal launch performs local integrity and schema checks only. It does not contact registries, GitHub, or update services and does not run package lifecycle scripts.

If the desired component state and embedded generation have not changed, the known-good profile is reused. This keeps launch fast and reduces mutation of the user's profile.

### 9.3 Studio upgrade

An application upgrade may contain a new lock generation. Studio composes it in staging and validates it before activation. User enable/disable choices carry forward by stable component ID, unless the component is removed or a documented migration changes its state schema.

If migration or validation fails:

- the previous profile generation remains active;
- the failing new generation is recorded for diagnostics;
- Studio starts with the old generation when compatible;
- if the old generation cannot start under the new app, Studio starts in safe mode and offers repair or application rollback guidance.

### 9.4 Enable or disable a component

The settings action first shows the component's permissions and configuration requirements. Confirmation changes desired state, triggers staged composition, and activates the new generation only after validation.

Disabling removes only Studio-managed bundle/dependency entries and links for that component. Plugin-owned user data is retained unless the user later chooses a separately designed data-removal action.

### 9.5 Safe mode

Safe mode starts the official DSH base and Web app plus the minimal Studio-owned brand, provider, theme, and recovery/settings capabilities. Ecosystem workbench components are omitted.

Safe mode can be entered automatically after a failed normal-start retry or manually from the desktop launch/recovery UI. It must make diagnostics and component disabling available without loading the failed plugin.

### 9.6 Browser automation enablement

The `dsh-browser` plugin code can ship with Studio while its browser engine remains absent. First enablement:

1. explains the automation, network, download-size, and local-storage implications;
2. checks for a compatible existing engine;
3. offers an explicit engine installation when missing;
4. verifies the downloaded engine's source, version, and digest;
5. records engine health separately from plugin health.

Failure to install or launch the engine leaves `dsh-browser` disabled and does not affect the human-facing embedded browser in Better Sidebar.

### 9.7 TUI launch

“Open in Terminal” asks the Tauri core to launch the bundled DSH executable with a separate TUI profile in a real terminal application. The TUI profile may share approved provider configuration and workspace selection, but its plugin bundle and mutable UI state are independent of the Web profile.

Closing the terminal does not stop the Studio Web runtime. TUI startup failure is surfaced as a component error, not as a Studio startup failure.

### 9.8 Marketplace phases

The first market integration is read-only: catalog metadata, locally bundled/current versions, compatibility, and update availability. It cannot execute install, update, remove, or lifecycle scripts.

A later installer service may add mutation only after a separate security design defines:

- trusted package sources and signatures/digests;
- dependency and lock resolution;
- lifecycle-script policy;
- permission declaration and consent;
- artifact scanning and quarantine;
- rollback and offline behavior;
- interaction between Studio-managed and user-managed components.

Core Studio-managed plugins cannot be replaced or removed through the marketplace.

## 10. Workbench Components UI

DSH Studio adds **Settings → Workbench Components**. Each component row or card shows:

- name, short role, source, bundled version, and active version;
- On, Off, Needs configuration, Incompatible, Failed, or Repairing status;
- concise permission summary;
- Configure, Enable/Disable, Repair, and View diagnostics actions as applicable;
- whether the component is Studio-managed, optional-engine-backed, or user-installed.

The page also provides:

- a global **Start in Safe Mode** action;
- current and previous profile generation identifiers;
- a clear notice when Studio is using a rolled-back generation;
- a link or action to export sanitized diagnostics;
- future marketplace entry without mixing marketplace browsing into core component recovery.

`dsh-at-file` integrates directly into the existing composer. Agent Teams receives task/team navigation within the Better Sidebar extension model. ModLens and Browser expose configuration through their component entries or supported feature UI. No component receives a second global appearance page.

## 11. Permissions and Security

This is a personal local installation, but plugin boundaries still matter because plugins can access files, terminals, browsers, models, and network resources.

Required controls:

1. DSH remains bound to `127.0.0.1`; changing the bind address is outside this design.
2. The loopback Web page receives narrowly scoped Tauri commands, not generic shell or filesystem APIs.
3. Every bundled artifact is pinned and digest-checked; its source and license are visible in the UI or notices.
4. Workspace access follows an explicit workspace root. `@file`, editor, terminal, and agents may not silently broaden it.
5. Terminal and browser automation permissions are declared distinctly from read-only workspace access.
6. Secrets remain in the existing provider/credential owner and must not be written into workbench state or diagnostics.
7. Diagnostics redact credentials, authorization headers, prompt content marked sensitive, and unnecessary absolute user paths.
8. Marketplace mutation remains disabled until separately approved and designed.
9. A plugin failure, malformed manifest, or integrity mismatch causes isolation/rollback, not a best-effort load of unverified code.

## 12. Error Handling and Recovery

Component status is derived from concrete phases so that “enabled” is not confused with “working”:

```text
artifact verified
  → profile composed
  → DSH process started
  → plugin registered
  → required service/configuration healthy
```

Errors identify the owning layer and retain the last successful evidence. Typical handling:

| Failure | Result |
|---|---|
| Embedded artifact missing or hash mismatch | Do not load it; mark Studio installation damaged; use safe mode |
| Existing profile manifest malformed | Preserve it; do not overwrite; start safe mode when possible and offer diagnostics |
| Conflict group has two enabled owners | Reject the new generation before activation |
| Plugin entrypoint cannot load | Isolate or disable that component and restore the prior generation |
| Plugin registers but required config is absent | Keep it off or mark Needs configuration; do not report healthy |
| Browser engine missing | Keep Browser off; other workbench features remain available |
| TUI terminal launch fails | Report only the TUI component error |
| New Studio generation fails | Restore prior known-good generation; show rollback notice |
| Previous generation also fails | Start safe mode and expose recovery actions |

Automatic recovery retries at most once per generation. Studio must avoid an infinite crash/recompose/relaunch loop.

## 13. Testing Strategy

### 13.1 Manifest and composer unit tests

- lock schema validation, digest comparison, and required provenance fields;
- stable component IDs and default-state initialization;
- conflict-group rejection;
- manifest merge retains unknown user dependencies, bundles, and fields;
- enabling and disabling changes only Studio-owned entries;
- atomic state writes and recovery from interrupted staging;
- migration from older component-state schemas;
- secret and path redaction in diagnostics.

### 13.2 Plugin contract tests

Each pinned plugin receives a small contract fixture that verifies:

- its declared package and bundle entrypoint load under the bundled DSH version;
- required DSH/Cordis services exist;
- it registers the expected capability or UI entry;
- it does not mount an excluded global theme or second shell;
- dispose/reload does not double-mount UI or leak a long-running process;
- missing optional configuration produces a bounded, understandable state.

### 13.3 Integration tests

- clean first launch with the three default-on components;
- migration of an existing profile with user-installed plugins and custom configuration;
- DSH Studio Themes plus Better Sidebar in all bundled themes;
- `@file` search, selection, permission denial, and referenced-content flow;
- Agent Teams creation, task update, and live panel recovery;
- ModLens disabled, configured, and provider-error paths;
- Browser engine absent, installed, corrupted, and repaired paths;
- TUI profile launch and isolation from Web profile state;
- component failure followed by isolation and previous-generation restore;
- manual and automatic safe mode;
- application upgrade, downgrade-compatible rollback, and retained user data.

### 13.4 End-to-end acceptance checks

The packaged macOS application—not only development mode—must demonstrate:

1. DSH binds only to loopback and the desktop page becomes ready.
2. Better Sidebar, `@file`, and Agent Teams are usable immediately.
3. Theme selection, restart persistence, wallpaper rendering, and all core controls remain usable with Better Sidebar active.
4. Enabling or disabling a component survives restart.
5. A deliberately broken plugin cannot prevent safe-mode startup.
6. A failed upgrade restores the previous known-good profile.
7. Existing conversations, user settings, and user-installed plugin entries remain present.
8. Normal relaunch performs no registry or GitHub request.

## 14. Delivery Phases

### Phase 1 — Assembly foundation

- verified workbench lock format and build-time assembler;
- runtime component state and transactional profile composer;
- known-good generation, rollback, safe mode, and diagnostics;
- Workbench Components settings page;
- theme/shell conflict enforcement.

### Phase 2 — Core workbench

- pin and package `dsh-better-sidebar`, `dsh-at-file`, and `dsh-agent-teams`;
- implement only the adapters/configuration needed to respect ownership boundaries;
- complete packaged-app integration and theme compatibility tests.

### Phase 3 — Optional capabilities

- pin and package ModLens and `dsh-browser` plugin code;
- implement provider configuration and optional browser-engine lifecycle;
- add the separate `dsh-TUI` profile and native terminal launch.

### Phase 4 — Controlled market

- add read-only market/catalog and compatibility views;
- design and review the installer security boundary separately;
- enable mutation only after that design and its rollback tests are approved.

## 15. Acceptance Criteria

The design is implemented when a personal macOS installation:

- opens a composed local DSH workbench without requiring npm, pnpm, GitHub, or a registry at runtime;
- enables Better Sidebar, `@file`, and Agent Teams by default;
- retains DSH Studio Themes as the sole theme owner and shows no duplicate sidebar/workbench shell;
- exposes reliable component status, configuration, enable/disable, repair, and diagnostics;
- keeps optional model, browser automation, TUI, and marketplace capabilities off until explicitly enabled;
- preserves existing DSH data and unrelated user-installed plugin entries;
- isolates a failing component and can start in safe mode;
- validates upgrades before activation and automatically restores a prior known-good generation on failure;
- continues to bind the DSH Web service to loopback only.

## 16. Implementation Preconditions

Before coding each third-party integration, implementation work must record:

- the exact repository and package identity;
- immutable version or full commit SHA;
- artifact digest and reproducible build command;
- license and redistribution conclusion;
- supported DSH version and required services;
- requested permissions and external binaries;
- known global UI extension points and conflict behavior;
- a minimal unload/reload and failure-isolation test.

If any precondition cannot be established, that component remains excluded or disabled. The design does not authorize guessing among same-name projects or shipping an unverified artifact.
