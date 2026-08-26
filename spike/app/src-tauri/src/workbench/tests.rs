use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use tempfile::TempDir;

use super::artifact::{hash_tree, load_verified_lock, resolve_enabled, resolve_enabled_for_role};
use super::browser::prepare_browser_extension;
use super::commands::{set_enabled_and_schedule, RestartScheduler};
use super::composer::ProfileComposer;
use super::market::search_market_catalog;
use super::model::{
    ComponentHealth, LockedComponent, ManagedProfileRecord, ProfileRole, WorkbenchLock,
    WorkbenchMode,
};
use super::service::{RecoveryAction, WorkbenchService};
use super::state::StateStore;
use super::tui::{prepare_tui_launcher, TuiLauncherPaths};

struct ArtifactFixture {
    temp: TempDir,
}

impl ArtifactFixture {
    fn new() -> Self {
        Self {
            temp: tempfile::tempdir().unwrap(),
        }
    }

    fn root(&self) -> &Path {
        self.temp.path()
    }

    fn component_path(&self, package: &str) -> PathBuf {
        self.root().join("plugins").join(package)
    }

    fn write_valid_component(&self, package: &str) {
        let root = self.component_path(package);
        std::fs::create_dir_all(root.join("lib")).unwrap();
        std::fs::write(
            root.join("package.json"),
            format!(r#"{{"name":"{package}","version":"1.0.0"}}"#),
        )
        .unwrap();
        std::fs::write(root.join("lib/index.js"), "export function apply() {}\n").unwrap();
        std::fs::create_dir_all(self.root().join("notices")).unwrap();
        std::fs::write(
            self.root().join("notices").join(format!("{package}.txt")),
            "MIT\n",
        )
        .unwrap();
    }

    fn component(&self, id: &str, package: &str) -> LockedComponent {
        LockedComponent {
            id: id.into(),
            display_name: id.into(),
            description: format!("{id} description"),
            package: package.into(),
            version: "1.0.0".into(),
            source: format!("workspace:{package}"),
            commit: "0123456789abcdef0123456789abcdef01234567".into(),
            supported_dsh: vec!["0.1.0-rc.8".into()],
            profile_role: ProfileRole::Web,
            runtime_dependencies: vec!["ws".into(), "@deepseek-ai/dsh-settings".into()],
            artifact_path: format!("plugins/{package}"),
            artifact_sha256: hash_tree(&self.component_path(package)).unwrap(),
            license: "MIT".into(),
            notice: format!("notices/{package}.txt"),
            profiles: vec!["web".into()],
            bundle_entrypoints: vec![package.into()],
            default_enabled: true,
            required: false,
            safe_mode: false,
            conflict_groups: Vec::new(),
            permissions: vec!["workspace-read".into()],
        }
    }

    fn lock(&self, component: LockedComponent) -> WorkbenchLock {
        WorkbenchLock {
            schema_version: 1,
            generation: "a".repeat(64),
            components: vec![component],
        }
    }

    fn write_lock(&self, lock: &WorkbenchLock) {
        std::fs::write(
            self.root().join("workbench.lock.json"),
            serde_json::to_vec_pretty(lock).unwrap(),
        )
        .unwrap();
    }
}

#[test]
fn lock_accepts_valid_artifact() {
    let fixture = ArtifactFixture::new();
    fixture.write_valid_component("plugin-a");
    let lock = fixture.lock(fixture.component("component-a", "plugin-a"));
    fixture.write_lock(&lock);

    assert_eq!(load_verified_lock(fixture.root()).unwrap(), lock);
}

#[test]
fn lock_accepts_isolated_tui_artifact() {
    let fixture = ArtifactFixture::new();
    fixture.write_valid_component("plugin-a");
    let mut component = fixture.component("component-a", "plugin-a");
    component.profiles = vec!["tui".into()];
    component.profile_role = ProfileRole::Tui;
    let lock = fixture.lock(component);
    fixture.write_lock(&lock);

    assert_eq!(load_verified_lock(fixture.root()).unwrap(), lock);
}

#[test]
fn lock_rejects_duplicate_ids_and_escape_paths() {
    let fixture = ArtifactFixture::new();
    fixture.write_valid_component("plugin-a");
    let mut lock = fixture.lock(fixture.component("component-a", "plugin-a"));
    lock.components.push(lock.components[0].clone());
    fixture.write_lock(&lock);
    assert_eq!(
        load_verified_lock(fixture.root()).unwrap_err().code(),
        "duplicate_component"
    );

    let mut lock = fixture.lock(fixture.component("component-a", "plugin-a"));
    lock.components[0].artifact_path = "../outside".into();
    fixture.write_lock(&lock);
    assert_eq!(
        load_verified_lock(fixture.root()).unwrap_err().code(),
        "artifact_path_escape"
    );
}

#[test]
fn lock_rejects_tampered_artifact() {
    let fixture = ArtifactFixture::new();
    fixture.write_valid_component("plugin-a");
    fixture.write_lock(&fixture.lock(fixture.component("component-a", "plugin-a")));
    std::fs::write(
        fixture.component_path("plugin-a").join("lib/index.js"),
        "tampered",
    )
    .unwrap();

    assert_eq!(
        load_verified_lock(fixture.root()).unwrap_err().code(),
        "artifact_hash_mismatch"
    );
}

#[test]
fn lock_rejects_invalid_immutable_provenance() {
    let fixture = ArtifactFixture::new();
    fixture.write_valid_component("plugin-a");

    let mut bad_commit = fixture.component("component-a", "plugin-a");
    bad_commit.commit = "main".into();
    fixture.write_lock(&fixture.lock(bad_commit));
    assert_eq!(
        load_verified_lock(fixture.root()).unwrap_err().code(),
        "invalid_component"
    );

    let mut no_runtime = fixture.component("component-a", "plugin-a");
    no_runtime.supported_dsh.clear();
    fixture.write_lock(&fixture.lock(no_runtime));
    assert_eq!(
        load_verified_lock(fixture.root()).unwrap_err().code(),
        "invalid_component"
    );

    let mut unsafe_dependency = fixture.component("component-a", "plugin-a");
    unsafe_dependency.runtime_dependencies = vec!["../escape".into()];
    fixture.write_lock(&fixture.lock(unsafe_dependency));
    assert_eq!(
        load_verified_lock(fixture.root()).unwrap_err().code(),
        "invalid_component"
    );
}

#[cfg(unix)]
#[test]
fn lock_rejects_symlink_inside_artifact() {
    use std::os::unix::fs::symlink;

    let fixture = ArtifactFixture::new();
    fixture.write_valid_component("plugin-a");
    let mut component = fixture.component("component-a", "plugin-a");
    let outside = fixture.root().join("outside.js");
    std::fs::write(&outside, "outside").unwrap();
    symlink(
        &outside,
        fixture.component_path("plugin-a").join("lib/escape.js"),
    )
    .unwrap();
    component.artifact_sha256 = "sha256:".to_string() + &"0".repeat(64);
    fixture.write_lock(&fixture.lock(component));

    assert_eq!(
        load_verified_lock(fixture.root()).unwrap_err().code(),
        "artifact_symlink"
    );
}

#[test]
fn effective_components_enforce_required_safe_mode_and_conflicts() {
    let core = LockedComponent {
        id: "core".into(),
        display_name: "Core".into(),
        description: "Core".into(),
        package: "core".into(),
        version: "1.0.0".into(),
        source: "workspace:core".into(),
        commit: "0123456789abcdef0123456789abcdef01234567".into(),
        supported_dsh: vec!["0.1.0-rc.8".into()],
        profile_role: ProfileRole::Web,
        runtime_dependencies: Vec::new(),
        artifact_path: "plugins/core".into(),
        artifact_sha256: "sha256:".to_string() + &"0".repeat(64),
        license: "MIT".into(),
        notice: "notices/core.txt".into(),
        profiles: vec!["web".into()],
        bundle_entrypoints: vec!["core".into()],
        default_enabled: true,
        required: true,
        safe_mode: true,
        conflict_groups: Vec::new(),
        permissions: Vec::new(),
    };
    let mut shell_a = core.clone();
    shell_a.id = "shell-a".into();
    shell_a.package = "shell-a".into();
    shell_a.required = false;
    shell_a.safe_mode = false;
    shell_a.conflict_groups = vec!["workbench-shell".into()];
    let mut shell_b = shell_a.clone();
    shell_b.id = "shell-b".into();
    shell_b.package = "shell-b".into();
    let lock = WorkbenchLock {
        schema_version: 1,
        generation: "b".repeat(64),
        components: vec![core, shell_a, shell_b],
    };
    let mut desired =
        BTreeMap::from([("shell-a".to_string(), true), ("shell-b".to_string(), true)]);

    assert_eq!(
        resolve_enabled(&lock, &desired, WorkbenchMode::Normal)
            .unwrap_err()
            .code(),
        "component_conflict"
    );
    desired.insert("shell-b".into(), false);
    let safe = resolve_enabled(&lock, &desired, WorkbenchMode::Safe).unwrap();
    assert_eq!(safe.len(), 1);
    assert!(safe.iter().all(|item| item.required && item.safe_mode));
}

#[test]
fn effective_components_are_isolated_by_profile_role() {
    let mut web = state_lock().components.remove(0);
    web.id = "web".into();
    web.package = "studio-web".into();
    web.conflict_groups = vec!["shell".into()];
    let mut tui = web.clone();
    tui.id = "tui".into();
    tui.package = "studio-tui".into();
    tui.profile_role = ProfileRole::Tui;
    tui.profiles = vec!["tui".into()];
    let lock = WorkbenchLock {
        schema_version: 1,
        generation: "d".repeat(64),
        components: vec![web, tui],
    };

    let enabled = resolve_enabled_for_role(
        &lock,
        &BTreeMap::new(),
        WorkbenchMode::Normal,
        ProfileRole::Web,
    )
    .unwrap();
    assert_eq!(enabled.len(), 1);
    assert_eq!(enabled[0].id, "web");
}

fn state_lock() -> WorkbenchLock {
    let component = |id: &str, required: bool, default_enabled: bool| LockedComponent {
        id: id.into(),
        display_name: id.into(),
        description: format!("{id} description"),
        package: format!("studio-{id}"),
        version: "1.0.0".into(),
        source: format!("workspace:{id}"),
        commit: "0123456789abcdef0123456789abcdef01234567".into(),
        supported_dsh: vec!["0.1.0-rc.8".into()],
        profile_role: ProfileRole::Web,
        runtime_dependencies: Vec::new(),
        artifact_path: format!("plugins/studio-{id}"),
        artifact_sha256: "sha256:".to_string() + &"0".repeat(64),
        license: "MIT".into(),
        notice: format!("notices/{id}.txt"),
        profiles: vec!["web".into()],
        bundle_entrypoints: vec![format!("studio-{id}")],
        default_enabled,
        required,
        safe_mode: required,
        conflict_groups: Vec::new(),
        permissions: Vec::new(),
    };
    WorkbenchLock {
        schema_version: 1,
        generation: "c".repeat(64),
        components: vec![
            component("required", true, true),
            component("optional", false, true),
        ],
    }
}

#[test]
fn state_initializes_defaults_without_overwriting_choices() {
    let temp = tempfile::tempdir().unwrap();
    let store = StateStore::new(temp.path().join("workbench"));
    let lock = state_lock();
    let mut state = store.load_or_initialize(&lock).unwrap();
    assert!(state.desired["optional"]);
    assert!(state.active["optional"]);

    state.desired.insert("optional".into(), false);
    store.save(&state).unwrap();
    let reloaded = store.load_or_initialize(&lock).unwrap();
    assert!(!reloaded.desired["optional"]);
    assert!(reloaded.active["optional"]);
}

#[test]
fn state_promotes_desired_only_when_requested() {
    let temp = tempfile::tempdir().unwrap();
    let store = StateStore::new(temp.path().join("workbench"));
    let lock = state_lock();
    store.load_or_initialize(&lock).unwrap();
    store.set_desired(&lock, "optional", false).unwrap();

    assert!(store.load_or_initialize(&lock).unwrap().active["optional"]);
    let promoted = store.promote_desired(&lock).unwrap();
    assert!(!promoted.active["optional"]);
    assert_eq!(promoted.active, promoted.desired);
}

#[test]
fn failed_launch_rolls_desired_back_to_active() {
    let temp = tempfile::tempdir().unwrap();
    let store = StateStore::new(temp.path().join("workbench"));
    let lock = state_lock();
    store.load_or_initialize(&lock).unwrap();
    store.set_desired(&lock, "optional", false).unwrap();

    store
        .rollback_desired("新组件启动失败，已恢复上一组组件")
        .unwrap();
    let state = store.load_or_initialize(&lock).unwrap();
    assert_eq!(state.desired, state.active);
    assert_eq!(
        state.warning.as_deref(),
        Some("新组件启动失败，已恢复上一组组件")
    );
}

#[test]
fn state_rejects_unknown_and_required_component_changes() {
    let temp = tempfile::tempdir().unwrap();
    let store = StateStore::new(temp.path().join("workbench"));
    let lock = state_lock();
    store.load_or_initialize(&lock).unwrap();

    assert_eq!(
        store
            .set_desired(&lock, "required", false)
            .unwrap_err()
            .code(),
        "required_component"
    );
    assert_eq!(
        store
            .set_desired(&lock, "missing", true)
            .unwrap_err()
            .code(),
        "unknown_component"
    );
}

#[test]
fn unreadable_state_is_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("workbench");
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("component-state.json");
    std::fs::write(&path, b"{broken").unwrap();

    let error = StateStore::new(root)
        .load_or_initialize(&state_lock())
        .unwrap_err();
    assert_eq!(error.code(), "state_unreadable");
    assert_eq!(std::fs::read(path).unwrap(), b"{broken");
}

struct ComposerFixture {
    temp: TempDir,
}

impl ComposerFixture {
    fn new() -> Self {
        let fixture = Self {
            temp: tempfile::tempdir().unwrap(),
        };
        for package in ["studio-required", "studio-optional"] {
            let root = fixture.assets().join("plugins").join(package);
            std::fs::create_dir_all(root.join("lib")).unwrap();
            std::fs::write(
                root.join("package.json"),
                format!(r#"{{"name":"{package}","version":"1.0.0"}}"#),
            )
            .unwrap();
            std::fs::write(root.join("lib/index.js"), "export function apply() {}\n").unwrap();
        }
        let shared = fixture.runtime_packages().join("ws");
        std::fs::create_dir_all(&shared).unwrap();
        std::fs::write(
            shared.join("package.json"),
            r#"{"name":"ws","version":"8.21.0"}"#,
        )
        .unwrap();
        fixture
    }

    fn root(&self) -> &Path {
        self.temp.path()
    }

    fn home(&self) -> PathBuf {
        self.root().join("home")
    }

    fn assets(&self) -> PathBuf {
        self.root().join("assets")
    }

    fn state_root(&self) -> PathBuf {
        self.root().join("state")
    }

    fn runtime_packages(&self) -> PathBuf {
        self.root().join("runtime/node_modules")
    }

    fn profile(&self) -> PathBuf {
        self.home().join("profiles/web")
    }

    fn profile_package(&self) -> PathBuf {
        self.profile().join("package.json")
    }

    fn node_modules(&self) -> PathBuf {
        self.profile().join("node_modules")
    }

    fn lock(&self) -> WorkbenchLock {
        let mut lock = state_lock();
        for component in &mut lock.components {
            component.artifact_sha256 =
                hash_tree(&self.assets().join(&component.artifact_path)).unwrap();
        }
        lock
    }

    fn write_existing_profile(&self) {
        std::fs::create_dir_all(self.node_modules()).unwrap();
        std::fs::write(
            self.profile_package(),
            r#"{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "studio-optional": "link:/old",
    "user-extra": "link:/user"
  },
  "custom": { "keep": true },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "studio-optional",
        "user-extra"
      ]
    }
  }
}
"#,
        )
        .unwrap();
        let managed = ManagedProfileRecord {
            generation: "old".into(),
            packages: vec!["studio-optional".into()],
            bundles: vec!["studio-optional".into()],
            runtime_dependencies: Vec::new(),
        };
        std::fs::write(
            self.profile().join(".dsh-studio-managed.json"),
            serde_json::to_vec_pretty(&managed).unwrap(),
        )
        .unwrap();
        make_test_link(
            &self.assets().join("plugins/studio-optional"),
            &self.node_modules().join("studio-optional"),
        );
        let user_source = self.root().join("user-extra");
        std::fs::create_dir_all(&user_source).unwrap();
        make_test_link(&user_source, &self.node_modules().join("user-extra"));
    }

    fn read_profile(&self) -> serde_json::Value {
        serde_json::from_slice(&std::fs::read(self.profile_package()).unwrap()).unwrap()
    }
}

#[cfg(unix)]
fn make_test_link(source: &Path, target: &Path) {
    std::os::unix::fs::symlink(source, target).unwrap();
}

#[cfg(windows)]
fn make_test_link(source: &Path, target: &Path) {
    fn copy_dir(source: &Path, target: &Path) {
        std::fs::create_dir_all(target).unwrap();
        for entry in std::fs::read_dir(source).unwrap() {
            let entry = entry.unwrap();
            let destination = target.join(entry.file_name());
            if entry.file_type().unwrap().is_dir() {
                copy_dir(&entry.path(), &destination);
            } else {
                std::fs::copy(entry.path(), destination).unwrap();
            }
        }
    }
    copy_dir(source, target);
}

#[test]
fn composer_preserves_user_entries_and_removes_only_managed_entries() {
    let fixture = ComposerFixture::new();
    fixture.write_existing_profile();
    let lock = fixture.lock();
    let mut desired = BTreeMap::from([
        ("required".to_string(), true),
        ("optional".to_string(), false),
    ]);
    desired.insert("optional".into(), false);

    let transaction = ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root())
        .compose(&lock, &desired, WorkbenchMode::Normal)
        .unwrap();
    let manifest = fixture.read_profile();
    assert_eq!(manifest["custom"]["keep"], true);
    assert_eq!(manifest["dependencies"]["user-extra"], "link:/user");
    assert!(manifest["dependencies"].get("studio-optional").is_none());
    assert!(manifest["dependencies"].get("studio-required").is_some());
    assert!(fixture
        .node_modules()
        .join("user-extra")
        .symlink_metadata()
        .is_ok());
    assert!(!fixture
        .node_modules()
        .join("studio-optional")
        .symlink_metadata()
        .is_ok());
    assert!(transaction.changed);
}

#[test]
fn composer_copies_components_and_links_declared_runtime_dependencies() {
    let fixture = ComposerFixture::new();
    let mut lock = fixture.lock();
    let required = lock
        .components
        .iter_mut()
        .find(|component| component.id == "required")
        .unwrap();
    required.runtime_dependencies = vec!["ws".into()];

    ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root())
        .with_runtime_packages(fixture.runtime_packages())
        .compose(&lock, &BTreeMap::new(), WorkbenchMode::Normal)
        .unwrap();

    let installed = fixture.node_modules().join("studio-required");
    let metadata = std::fs::symlink_metadata(&installed).unwrap();
    assert!(metadata.is_dir());
    assert!(!metadata.file_type().is_symlink());
    assert_eq!(
        std::fs::read(installed.join("lib/index.js")).unwrap(),
        b"export function apply() {}\n"
    );
    assert!(fixture.node_modules().join("ws/package.json").is_file());
}

#[test]
fn composer_never_installs_tui_components_into_the_web_profile() {
    let fixture = ComposerFixture::new();
    let mut lock = fixture.lock();
    let tui = lock
        .components
        .iter_mut()
        .find(|component| component.id == "optional")
        .unwrap();
    tui.profile_role = ProfileRole::Tui;
    tui.profiles = vec!["tui".into()];

    ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root())
        .compose(&lock, &BTreeMap::new(), WorkbenchMode::Normal)
        .unwrap();

    let manifest = fixture.read_profile();
    assert!(manifest["dependencies"].get("studio-required").is_some());
    assert!(manifest["dependencies"].get("studio-optional").is_none());
    assert!(!fixture.node_modules().join("studio-optional").exists());
}

#[test]
fn tui_composer_writes_only_the_isolated_tui_profile() {
    let fixture = ComposerFixture::new();
    let mut lock = fixture.lock();
    let tui = lock
        .components
        .iter_mut()
        .find(|component| component.id == "optional")
        .unwrap();
    tui.profile_role = ProfileRole::Tui;
    tui.profiles = vec!["tui".into()];
    tui.runtime_dependencies = vec!["ws".into()];

    ProfileComposer::new_tui(fixture.home(), fixture.assets(), fixture.state_root())
        .with_runtime_package_roots(vec![
            fixture.root().join("missing-runtime"),
            fixture.runtime_packages(),
        ])
        .compose(&lock, &BTreeMap::new(), WorkbenchMode::Normal)
        .unwrap();

    assert!(!fixture.home().join("profiles/web/package.json").exists());
    let profile = fixture.home().join("profiles/dsh-tui");
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(profile.join("package.json")).unwrap()).unwrap();
    assert!(manifest["dependencies"].get("studio-optional").is_some());
    assert!(manifest["dependencies"].get("studio-required").is_none());
    assert!(profile.join("node_modules/ws/package.json").is_file());
    assert_eq!(
        manifest["dsh"]["profile"]["bundles"],
        serde_json::json!(["@deepseek-ai/dsh-base", "studio-optional"])
    );
}

#[cfg(unix)]
#[test]
fn tui_launcher_uses_only_the_bundled_runtime_and_safely_quotes_paths() {
    use std::os::unix::fs::PermissionsExt;

    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("Studio's Runtime");
    let node = root.join("node/bin/node");
    let dsh_bin_dir = root.join("app/node_modules/.bin");
    let dsh_entry = root.join("app/node_modules/@deepseek-ai/dsh/lib/bin.js");
    let dsh_home = root.join("home");
    let profile_bin =
        dsh_home.join("profiles/dsh-tui/node_modules/@deepseek-harness-tui/dsh-tui/bin/dsh-tui.js");
    let workspace = root.join("Workspace's Files");
    for path in [&node, &dsh_entry, &profile_bin] {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "fixture").unwrap();
    }
    std::fs::create_dir_all(&dsh_bin_dir).unwrap();
    std::fs::create_dir_all(&workspace).unwrap();
    let script = root.join("launch.command");

    prepare_tui_launcher(&TuiLauncherPaths {
        script: &script,
        node: &node,
        dsh_bin_dir: &dsh_bin_dir,
        dsh_entry: &dsh_entry,
        dsh_home: &dsh_home,
        profile_bin: &profile_bin,
        workspace: &workspace,
    })
    .unwrap();

    let body = std::fs::read_to_string(&script).unwrap();
    assert!(body.contains("export DSH_HOME='"));
    assert!(body.contains("DSH_STUDIO_DSH_ENTRY='"));
    assert!(body.contains("'\\''"));
    let quoted_node = format!("'{}'", node.to_string_lossy().replace('\'', "'\\''"));
    assert!(body.contains(&format!("exec {quoted_node}")));
    assert_eq!(
        std::fs::metadata(script).unwrap().permissions().mode() & 0o777,
        0o700
    );
}

#[cfg(unix)]
#[test]
fn tui_launcher_can_replace_an_existing_script() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("runtime");
    let node = root.join("node/bin/node");
    let dsh_bin_dir = root.join("app/node_modules/.bin");
    let dsh_entry = root.join("app/node_modules/@deepseek-ai/dsh/lib/bin.js");
    let dsh_home = root.join("home");
    let profile_bin =
        dsh_home.join("profiles/dsh-tui/node_modules/@deepseek-harness-tui/dsh-tui/bin/dsh-tui.js");
    let first_workspace = root.join("first-workspace");
    let second_workspace = root.join("second-workspace");
    for path in [&node, &dsh_entry, &profile_bin] {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "fixture").unwrap();
    }
    for path in [&dsh_bin_dir, &first_workspace, &second_workspace] {
        std::fs::create_dir_all(path).unwrap();
    }
    let script = root.join("launch.command");
    let launch = |workspace: &Path| {
        prepare_tui_launcher(&TuiLauncherPaths {
            script: &script,
            node: &node,
            dsh_bin_dir: &dsh_bin_dir,
            dsh_entry: &dsh_entry,
            dsh_home: &dsh_home,
            profile_bin: &profile_bin,
            workspace,
        })
        .unwrap();
    };

    launch(&first_workspace);
    launch(&second_workspace);

    let body = std::fs::read_to_string(&script).unwrap();
    assert!(body.contains(&second_workspace.display().to_string()));
    assert!(!body.contains(&first_workspace.display().to_string()));
    assert_eq!(
        std::fs::read_dir(script.parent().unwrap())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains("tui-launch"))
            .count(),
        0
    );
}

#[test]
fn browser_extension_preparation_is_versioned_and_transactional() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    let destination = temp.path().join("prepared");
    std::fs::create_dir_all(source.join("panel")).unwrap();
    std::fs::write(
        source.join("manifest.json"),
        r#"{"manifest_version":3,"version":"0.1.1"}"#,
    )
    .unwrap();
    std::fs::write(source.join("background.js"), "first").unwrap();
    std::fs::write(source.join("panel/index.html"), "panel").unwrap();

    let prepared = prepare_browser_extension(&source, &destination, "0.1.1").unwrap();
    assert_eq!(prepared, destination.join("0.1.1"));
    assert_eq!(
        std::fs::read_to_string(prepared.join("background.js")).unwrap(),
        "first"
    );

    std::fs::write(source.join("manifest.json"), r#"{"version":"9.9.9"}"#).unwrap();
    assert_eq!(
        prepare_browser_extension(&source, &destination, "0.1.1")
            .unwrap_err()
            .code(),
        "browser_extension_version"
    );
    assert_eq!(
        std::fs::read_to_string(prepared.join("background.js")).unwrap(),
        "first"
    );
}

#[cfg(unix)]
#[test]
fn browser_extension_rejects_symlinks_without_replacing_previous_copy() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    let destination = temp.path().join("prepared");
    std::fs::create_dir_all(&source).unwrap();
    std::fs::write(source.join("manifest.json"), r#"{"version":"0.1.1"}"#).unwrap();
    std::fs::write(source.join("background.js"), "safe").unwrap();
    let prepared = prepare_browser_extension(&source, &destination, "0.1.1").unwrap();
    std::os::unix::fs::symlink("background.js", source.join("escape.js")).unwrap();

    assert_eq!(
        prepare_browser_extension(&source, &destination, "0.1.1")
            .unwrap_err()
            .code(),
        "browser_extension_symlink"
    );
    assert_eq!(
        std::fs::read_to_string(prepared.join("background.js")).unwrap(),
        "safe"
    );
}

#[test]
fn market_catalog_search_is_read_only_bounded_and_localized() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("plugins.json");
    std::fs::write(
        &path,
        r#"{
  "categories": {"ui": {"zh": "界面", "en": "UI"}},
  "plugins": [
    {"name":"dsh-at-file","owner":"omdsh-dev","description":{"zh":"文件引用","en":"file references"}},
    {"name":"dsh-browser","owner":"Lum1104","description":{"zh":"浏览器控制","en":"browser control"},"install":"dsh plugin add dsh-browser","tarball":"https://example.invalid/plugin.tgz"}
  ]
}"#,
    )
    .unwrap();
    let before = std::fs::read(&path).unwrap();

    let page = search_market_catalog(&path, "浏览器", 500).unwrap();

    assert_eq!(page.total, 2);
    assert_eq!(page.matched, 1);
    assert_eq!(page.plugins[0].name, "dsh-browser");
    let exposed = serde_json::to_value(&page.plugins[0]).unwrap();
    assert!(exposed.get("install").is_none());
    assert!(exposed.get("tarball").is_none());
    assert_eq!(std::fs::read(path).unwrap(), before);

    let many = temp.path().join("many-plugins.json");
    std::fs::write(
        &many,
        serde_json::to_vec(&serde_json::json!({
            "plugins": (0..60)
                .map(|index| serde_json::json!({"name": format!("plugin-{index}")}))
                .collect::<Vec<_>>()
        }))
        .unwrap(),
    )
    .unwrap();
    let bounded = search_market_catalog(&many, "", 500).unwrap();
    assert_eq!(bounded.matched, 60);
    assert_eq!(bounded.plugins.len(), 50);
}

#[test]
fn composer_rolls_back_after_mid_transaction_failure() {
    let fixture = ComposerFixture::new();
    fixture.write_existing_profile();
    let before = std::fs::read(fixture.profile_package()).unwrap();
    let lock = fixture.lock();
    let composer = ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root())
        .with_test_link_failure("studio-required");

    let error = composer
        .compose(&lock, &BTreeMap::new(), WorkbenchMode::Normal)
        .unwrap_err();
    assert_eq!(error.code(), "profile_compose_failed");
    assert_eq!(std::fs::read(fixture.profile_package()).unwrap(), before);
    assert!(fixture
        .node_modules()
        .join("studio-optional")
        .symlink_metadata()
        .is_ok());
}

#[test]
fn explicit_rollback_restores_previous_profile_and_keeps_user_links() {
    let fixture = ComposerFixture::new();
    fixture.write_existing_profile();
    let composer = ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root());
    let lock = fixture.lock();
    let desired = BTreeMap::from([("optional".to_string(), false)]);
    let transaction = composer
        .compose(&lock, &desired, WorkbenchMode::Normal)
        .unwrap();

    composer.rollback(&transaction.id).unwrap();
    let restored = fixture.read_profile();
    assert!(restored["dependencies"].get("studio-optional").is_some());
    assert_eq!(restored["dependencies"]["user-extra"], "link:/user");
    assert!(fixture
        .node_modules()
        .join("user-extra")
        .symlink_metadata()
        .is_ok());
}

#[test]
fn identical_composition_does_not_rewrite_profile() {
    let fixture = ComposerFixture::new();
    let composer = ProfileComposer::new(fixture.home(), fixture.assets(), fixture.state_root());
    let lock = fixture.lock();
    composer
        .compose(&lock, &BTreeMap::new(), WorkbenchMode::Normal)
        .unwrap();
    let before = std::fs::read(fixture.profile_package()).unwrap();
    let second = composer
        .compose(&lock, &BTreeMap::new(), WorkbenchMode::Normal)
        .unwrap();

    assert!(!second.changed);
    assert_eq!(std::fs::read(fixture.profile_package()).unwrap(), before);
}

struct ServiceFixture {
    temp: TempDir,
    service: WorkbenchService,
    lock: WorkbenchLock,
    state_root: PathBuf,
}

impl ServiceFixture {
    fn new() -> Self {
        Self::configured(None, ProfileRole::Web)
    }

    fn with_damage(damaged: Option<&str>) -> Self {
        Self::configured(damaged, ProfileRole::Web)
    }

    fn with_optional_role(role: ProfileRole) -> Self {
        Self::configured(None, role)
    }

    fn configured(damaged: Option<&str>, optional_role: ProfileRole) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let assets = temp.path().join("assets");
        let home = temp.path().join("home");
        let state_root = temp.path().join("state");
        std::fs::create_dir_all(assets.join("notices")).unwrap();
        let mut lock = state_lock();
        let optional = lock
            .components
            .iter_mut()
            .find(|component| component.id == "optional")
            .unwrap();
        optional.profile_role = optional_role;
        optional.profiles = vec![match optional_role {
            ProfileRole::Web => "web",
            ProfileRole::Tui => "tui",
            ProfileRole::Catalog => "catalog",
        }
        .into()];
        for component in &mut lock.components {
            let root = assets.join(&component.artifact_path);
            std::fs::create_dir_all(root.join("lib")).unwrap();
            std::fs::write(
                root.join("package.json"),
                format!(
                    r#"{{"name":"{}","version":"{}"}}"#,
                    component.package, component.version
                ),
            )
            .unwrap();
            std::fs::write(root.join("lib/index.js"), "export function apply() {}\n").unwrap();
            std::fs::write(assets.join(&component.notice), "MIT\n").unwrap();
            component.artifact_sha256 = hash_tree(&root).unwrap();
        }
        std::fs::write(
            assets.join("workbench.lock.json"),
            serde_json::to_vec_pretty(&lock).unwrap(),
        )
        .unwrap();
        if let Some(id) = damaged {
            let component = lock.components.iter().find(|item| item.id == id).unwrap();
            std::fs::write(
                assets.join(&component.artifact_path).join("lib/index.js"),
                "tampered",
            )
            .unwrap();
        }
        let service = WorkbenchService::new(
            assets,
            home,
            state_root.clone(),
            temp.path().join("runtime/node_modules"),
            temp.path().join("runtime-tui/node_modules"),
        )
        .unwrap();
        Self {
            temp,
            service,
            lock,
            state_root,
        }
    }

    fn state(&self) -> super::model::ComponentState {
        let _keep_temp_alive = &self.temp;
        StateStore::new(self.state_root.clone())
            .load_or_initialize(&self.lock)
            .unwrap()
    }
}

#[test]
fn service_promotes_desired_only_after_ready() {
    let fixture = ServiceFixture::new();
    fixture.service.set_enabled("optional", false).unwrap();
    let launch = fixture
        .service
        .prepare_launch(WorkbenchMode::Normal)
        .unwrap();
    assert!(fixture.state().active["optional"]);
    assert!(!fixture.state().desired["optional"]);

    fixture.service.mark_ready(&launch.id).unwrap();
    assert!(!fixture.state().active["optional"]);
}

#[test]
fn failed_changed_launch_rolls_back_once_then_requests_safe_mode() {
    let fixture = ServiceFixture::new();
    fixture.service.set_enabled("optional", false).unwrap();
    let launch = fixture
        .service
        .prepare_launch(WorkbenchMode::Normal)
        .unwrap();
    let failed_transaction = launch.transaction_id.clone().unwrap();
    assert!(fixture
        .state_root
        .join("generations")
        .join(&failed_transaction)
        .exists());

    assert_eq!(
        fixture
            .service
            .mark_failed(&launch.id, "host exited before ready")
            .unwrap(),
        RecoveryAction::LaunchSafeMode
    );
    assert_eq!(fixture.state().desired, fixture.state().active);
    assert!(
        !fixture
            .state_root
            .join("generations")
            .join(failed_transaction)
            .exists(),
        "a restored failed transaction must not remain as an unreachable snapshot"
    );

    let safe = fixture.service.prepare_launch(WorkbenchMode::Safe).unwrap();
    assert_eq!(
        fixture
            .service
            .mark_failed(&safe.id, "safe host failed")
            .unwrap(),
        RecoveryAction::Stop
    );
}

#[test]
fn catalog_marks_damaged_optional_component_without_hiding_list() {
    let fixture = ServiceFixture::with_damage(Some("optional"));
    let catalog = fixture.service.catalog().unwrap();
    assert_eq!(catalog.components.len(), 2);
    let optional = catalog
        .components
        .iter()
        .find(|item| item.id == "optional")
        .unwrap();
    assert!(optional.enabled);
    assert!(!optional.effective_enabled);
    assert_eq!(optional.health, ComponentHealth::Damaged);
}

#[derive(Default)]
struct RecordingRestart {
    modes: std::sync::Mutex<Vec<WorkbenchMode>>,
}

impl RestartScheduler for RecordingRestart {
    fn schedule(&self, mode: WorkbenchMode) -> Result<(), super::WorkbenchError> {
        self.modes.lock().unwrap().push(mode);
        Ok(())
    }
}

#[test]
fn command_rejects_invalid_toggle_without_scheduling_restart() {
    let fixture = ServiceFixture::new();
    let restart = RecordingRestart::default();

    assert_eq!(
        set_enabled_and_schedule(&fixture.service, &restart, "required", false)
            .unwrap_err()
            .code(),
        "required_component"
    );
    assert_eq!(
        set_enabled_and_schedule(&fixture.service, &restart, "missing", true)
            .unwrap_err()
            .code(),
        "unknown_component"
    );
    assert!(restart.modes.lock().unwrap().is_empty());
}

#[test]
fn non_web_component_toggle_is_immediate_and_does_not_restart_web() {
    let fixture = ServiceFixture::with_optional_role(ProfileRole::Tui);
    let restart = RecordingRestart::default();

    let catalog = set_enabled_and_schedule(&fixture.service, &restart, "optional", false).unwrap();

    assert!(restart.modes.lock().unwrap().is_empty());
    assert!(!fixture.state().desired["optional"]);
    assert!(!fixture.state().active["optional"]);
    assert_eq!(
        catalog
            .components
            .iter()
            .find(|component| component.id == "optional")
            .unwrap()
            .health,
        ComponentHealth::Disabled
    );
}

#[test]
#[ignore = "requires the prepared bundled runtime and assembled workbench"]
fn bundled_default_ecosystem_composes_and_reaches_dsh_web_ready() {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::time::Duration;

    let spike = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let assets = spike.join("workbench/dist").canonicalize().unwrap();
    let runtime = spike.join("runtime").canonicalize().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("dsh-home");
    let state = temp.path().join("state");
    let service = WorkbenchService::new(
        assets,
        home.clone(),
        state,
        runtime.join("app/node_modules"),
        runtime.join("tui/node_modules"),
    )
    .unwrap();
    let launch = service.prepare_launch(WorkbenchMode::Normal).unwrap();
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(home.join("profiles/web/package.json")).unwrap())
            .unwrap();
    for package in [
        "dsh-better-sidebar",
        "dsh-at-file",
        "@nanmicoder/dsh-agent-teams",
    ] {
        assert!(manifest["dependencies"].get(package).is_some(), "{package}");
        assert!(home
            .join("profiles/web/node_modules")
            .join(package)
            .exists());
    }
    assert!(manifest["dependencies"].get("@liustack/modlens").is_none());
    assert!(manifest["dependencies"]
        .get("@yuxianglin/dsh-bridge-browser")
        .is_none());

    #[cfg(windows)]
    let node = runtime.join("node/node.exe");
    #[cfg(not(windows))]
    let node = runtime.join("node/bin/node");
    let mut child = Command::new(node)
        .arg(runtime.join("app/node_modules/@deepseek-ai/dsh/lib/bin.js"))
        .args(["web", "--host", "127.0.0.1", "--port", "0"])
        .env("DSH_HOME", &home)
        .current_dir(temp.path())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let stdout = child.stdout.take().unwrap();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.starts_with("dsh web: http://127.0.0.1:") {
                let _ = sender.send(line);
                break;
            }
        }
    });
    let ready = receiver.recv_timeout(Duration::from_secs(30)).unwrap();
    child.kill().unwrap();
    let _ = child.wait();
    service.mark_ready(&launch.id).unwrap();
    assert!(ready.starts_with("dsh web: http://127.0.0.1:"));
}

#[test]
#[ignore = "requires the prepared bundled runtime and assembled workbench"]
fn bundled_opt_in_components_prepare_real_local_assets() {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::time::Duration;

    let spike = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let assets = spike.join("workbench/dist").canonicalize().unwrap();
    let runtime = spike.join("runtime").canonicalize().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("dsh-home");
    let service = WorkbenchService::new(
        assets,
        home.clone(),
        temp.path().join("state"),
        runtime.join("app/node_modules"),
        runtime.join("tui/node_modules"),
    )
    .unwrap();
    for id in ["tui", "browser", "market"] {
        service.set_enabled(id, true).unwrap();
    }
    let web_launch = service.prepare_launch(WorkbenchMode::Normal).unwrap();
    #[cfg(windows)]
    let node = runtime.join("node/node.exe");
    #[cfg(not(windows))]
    let node = runtime.join("node/bin/node");
    let mut child = Command::new(&node)
        .arg(runtime.join("app/node_modules/@deepseek-ai/dsh/lib/bin.js"))
        .args(["web", "--host", "127.0.0.1", "--port", "0"])
        .env("DSH_HOME", &home)
        .current_dir(temp.path())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let stdout = child.stdout.take().unwrap();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.starts_with("dsh web: http://127.0.0.1:") {
                let _ = sender.send(line);
                break;
            }
        }
    });
    let ready = receiver.recv_timeout(Duration::from_secs(30)).unwrap();
    child.kill().unwrap();
    let _ = child.wait();
    service.mark_ready(&web_launch.id).unwrap();
    assert!(ready.starts_with("dsh web: http://127.0.0.1:"));
    assert!(home.join("ext-bridge-token").is_file());

    let profile = service.prepare_tui_profile().unwrap();
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(profile.join("package.json")).unwrap()).unwrap();
    assert!(manifest["dependencies"]
        .get("@deepseek-harness-tui/dsh-tui")
        .is_some());
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(
            &std::fs::read(profile.join("node_modules/react/package.json")).unwrap()
        )
        .unwrap()["version"],
        "19.2.8"
    );

    let version = Command::new(&node)
        .arg(profile.join("node_modules/@deepseek-harness-tui/dsh-tui/bin/dsh-tui.js"))
        .arg("version")
        .env("DSH_HOME", &home)
        .output()
        .unwrap();
    assert!(
        version.status.success(),
        "{}",
        String::from_utf8_lossy(&version.stderr)
    );
    let version = String::from_utf8_lossy(&version.stdout);
    assert!(version.contains("0.9.3"), "{version}");

    let browser = service
        .enabled_artifact("browser", ProfileRole::Web)
        .unwrap();
    let prepared = prepare_browser_extension(
        &browser.join("browser-extension"),
        &temp.path().join("prepared-browser"),
        "0.1.1",
    )
    .unwrap();
    assert!(prepared.join("manifest.json").is_file());

    let market = service
        .enabled_artifact("market", ProfileRole::Catalog)
        .unwrap();
    let page = search_market_catalog(&market.join("data/plugins.json"), "browser", 20).unwrap();
    assert_eq!(page.total, 2189);
    assert!(page.matched > 0);
    assert!(!page.plugins.is_empty());
}

#[test]
fn valid_toggle_persists_desired_before_scheduling_restart() {
    let fixture = ServiceFixture::new();
    let restart = RecordingRestart::default();

    let catalog = set_enabled_and_schedule(&fixture.service, &restart, "optional", false).unwrap();
    assert!(
        !catalog
            .components
            .iter()
            .find(|component| component.id == "optional")
            .unwrap()
            .enabled
    );
    assert!(!fixture.state().desired["optional"]);
    assert_eq!(*restart.modes.lock().unwrap(), vec![WorkbenchMode::Normal]);
}
