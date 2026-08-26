use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use tempfile::TempDir;

use super::artifact::{hash_tree, load_verified_lock, resolve_enabled};
use super::commands::{set_enabled_and_schedule, RestartScheduler};
use super::composer::ProfileComposer;
use super::model::{
    ComponentHealth, LockedComponent, ManagedProfileRecord, WorkbenchLock, WorkbenchMode,
};
use super::service::{RecoveryAction, WorkbenchService};
use super::state::StateStore;

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

fn state_lock() -> WorkbenchLock {
    let component = |id: &str, required: bool, default_enabled: bool| LockedComponent {
        id: id.into(),
        display_name: id.into(),
        description: format!("{id} description"),
        package: format!("studio-{id}"),
        version: "1.0.0".into(),
        source: format!("workspace:{id}"),
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
        state_lock()
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
        Self::with_damage(None)
    }

    fn with_damage(damaged: Option<&str>) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let assets = temp.path().join("assets");
        let home = temp.path().join("home");
        let state_root = temp.path().join("state");
        std::fs::create_dir_all(assets.join("notices")).unwrap();
        let mut lock = state_lock();
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
        let service = WorkbenchService::new(assets, home, state_root.clone()).unwrap();
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
