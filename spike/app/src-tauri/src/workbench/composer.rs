use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::artifact::resolve_enabled;
use super::model::{CompositionTransaction, ManagedProfileRecord, WorkbenchLock, WorkbenchMode};
use super::WorkbenchError;

const BASE_BUNDLE: &str = "@deepseek-ai/dsh-base";
const WEB_BUNDLE: &str = "@deepseek-ai/dsh-web-app";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TransactionRecord {
    transaction: CompositionTransaction,
    had_package: bool,
    had_managed: bool,
    affected_packages: Vec<String>,
}

pub struct ProfileComposer {
    home: PathBuf,
    assets: PathBuf,
    state_root: PathBuf,
    #[cfg(test)]
    fail_link_for: Option<String>,
}

impl ProfileComposer {
    pub fn new(home: PathBuf, assets: PathBuf, state_root: PathBuf) -> Self {
        Self {
            home,
            assets,
            state_root,
            #[cfg(test)]
            fail_link_for: None,
        }
    }

    #[cfg(test)]
    pub fn with_test_link_failure(mut self, package: &str) -> Self {
        self.fail_link_for = Some(package.to_string());
        self
    }

    fn profile(&self) -> PathBuf {
        self.home.join("profiles/web")
    }

    fn package_path(&self) -> PathBuf {
        self.profile().join("package.json")
    }

    fn managed_path(&self) -> PathBuf {
        self.profile().join(".dsh-studio-managed.json")
    }

    fn node_modules(&self) -> PathBuf {
        self.profile().join("node_modules")
    }

    fn generations(&self) -> PathBuf {
        self.state_root.join("generations")
    }

    fn transaction_dir(&self, id: &str) -> Result<PathBuf, WorkbenchError> {
        let parsed = uuid::Uuid::parse_str(id)
            .map_err(|_| WorkbenchError::new("invalid_transaction", "工作台回滚标识无效"))?;
        if parsed.to_string() != id {
            return Err(WorkbenchError::new(
                "invalid_transaction",
                "工作台回滚标识无效",
            ));
        }
        Ok(self.generations().join(id))
    }

    pub fn compose(
        &self,
        lock: &WorkbenchLock,
        desired: &BTreeMap<String, bool>,
        mode: WorkbenchMode,
    ) -> Result<CompositionTransaction, WorkbenchError> {
        let enabled = resolve_enabled(lock, desired, mode)?;
        std::fs::create_dir_all(self.node_modules()).map_err(|_| {
            WorkbenchError::new("profile_compose_failed", "无法创建 DSH Web Profile")
        })?;

        let had_package = self.package_path().exists();
        let package_raw = if had_package {
            std::fs::read_to_string(self.package_path()).map_err(|_| {
                WorkbenchError::new("profile_unreadable", "DSH Web Profile 无法读取")
            })?
        } else {
            default_manifest().to_string()
        };
        let mut manifest: serde_json::Value = serde_json::from_str(&package_raw)
            .map_err(|_| WorkbenchError::new("profile_unreadable", "DSH Web Profile 无法解析"))?;

        let had_managed = self.managed_path().exists();
        let previous = if had_managed {
            let raw = std::fs::read_to_string(self.managed_path()).map_err(|_| {
                WorkbenchError::new("managed_record_unreadable", "组件管理记录无法读取")
            })?;
            serde_json::from_str::<ManagedProfileRecord>(&raw).map_err(|_| {
                WorkbenchError::new("managed_record_unreadable", "组件管理记录无法解析")
            })?
        } else {
            ManagedProfileRecord::default()
        };

        let current_packages = lock
            .components
            .iter()
            .map(|component| component.package.clone())
            .collect::<BTreeSet<_>>();
        let current_bundles = lock
            .components
            .iter()
            .flat_map(|component| component.bundle_entrypoints.iter().cloned())
            .collect::<BTreeSet<_>>();
        let owned_packages = previous
            .packages
            .iter()
            .cloned()
            .chain(current_packages.iter().cloned())
            .collect::<BTreeSet<_>>();
        let owned_bundles = previous
            .bundles
            .iter()
            .cloned()
            .chain(current_bundles.iter().cloned())
            .collect::<BTreeSet<_>>();

        let dependencies = manifest
            .as_object_mut()
            .ok_or_else(|| WorkbenchError::new("profile_unreadable", "DSH Web Profile 不是对象"))?
            .entry("dependencies")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or_else(|| WorkbenchError::new("profile_unreadable", "dependencies 不是对象"))?;
        for package in &owned_packages {
            dependencies.remove(package);
        }
        for component in &enabled {
            validate_package_name(&component.package)?;
            let artifact = self.assets.join(&component.artifact_path);
            dependencies.insert(
                component.package.clone(),
                serde_json::Value::String(format!("link:{}", artifact.display())),
            );
        }

        let bundles = manifest
            .as_object_mut()
            .expect("manifest object validated")
            .entry("dsh")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or_else(|| WorkbenchError::new("profile_unreadable", "dsh 不是对象"))?
            .entry("profile")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or_else(|| WorkbenchError::new("profile_unreadable", "dsh.profile 不是对象"))?
            .entry("bundles")
            .or_insert_with(|| serde_json::json!([BASE_BUNDLE, WEB_BUNDLE]))
            .as_array_mut()
            .ok_or_else(|| WorkbenchError::new("profile_unreadable", "bundles 不是数组"))?;
        bundles.retain(|value| {
            value
                .as_str()
                .is_none_or(|bundle| !owned_bundles.contains(bundle))
        });
        for component in &enabled {
            for entrypoint in &component.bundle_entrypoints {
                if !bundles
                    .iter()
                    .any(|value| value.as_str() == Some(entrypoint))
                {
                    bundles.push(serde_json::Value::String(entrypoint.clone()));
                }
            }
        }

        let next_managed = ManagedProfileRecord {
            generation: lock.generation.clone(),
            packages: enabled
                .iter()
                .map(|component| component.package.clone())
                .collect(),
            bundles: enabled
                .iter()
                .flat_map(|component| component.bundle_entrypoints.iter().cloned())
                .collect(),
        };
        let package_bytes = pretty_json(&manifest)?;
        let managed_bytes = pretty_json(&next_managed)?;

        if profile_matches(&package_raw, &manifest)
            && previous == next_managed
            && enabled.iter().all(|component| self.link_matches(component))
            && owned_packages.iter().all(|package| {
                next_managed.packages.contains(package)
                    || self
                        .node_modules()
                        .join(package)
                        .symlink_metadata()
                        .is_err()
            })
        {
            return Ok(CompositionTransaction {
                id: uuid::Uuid::new_v4().to_string(),
                lock_generation: lock.generation.clone(),
                mode,
                changed: false,
            });
        }

        let transaction = CompositionTransaction {
            id: uuid::Uuid::new_v4().to_string(),
            lock_generation: lock.generation.clone(),
            mode,
            changed: true,
        };
        let transaction_dir = self.transaction_dir(&transaction.id)?;
        std::fs::create_dir_all(transaction_dir.join("links"))
            .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法创建组件回滚快照"))?;
        if had_package {
            std::fs::copy(
                self.package_path(),
                transaction_dir.join("profile-package.json"),
            )
            .map_err(|_| {
                WorkbenchError::new("profile_compose_failed", "无法备份 DSH Web Profile")
            })?;
        }
        if had_managed {
            std::fs::copy(self.managed_path(), transaction_dir.join("managed.json")).map_err(
                |_| WorkbenchError::new("profile_compose_failed", "无法备份组件管理记录"),
            )?;
        }
        let record = TransactionRecord {
            transaction: transaction.clone(),
            had_package,
            had_managed,
            affected_packages: owned_packages.iter().cloned().collect(),
        };
        atomic_write(
            &transaction_dir.join("transaction.json"),
            &pretty_json(&record)?,
        )?;

        let apply_result =
            self.apply_links(&transaction, &transaction_dir, &owned_packages, &enabled);
        if apply_result.is_ok() {
            if let Err(error) = atomic_write(&self.package_path(), &package_bytes)
                .and_then(|_| atomic_write(&self.managed_path(), &managed_bytes))
            {
                let _ = self.rollback(&transaction.id);
                return Err(error);
            }
            return Ok(transaction);
        }

        let _ = std::fs::remove_dir_all(
            self.node_modules()
                .join(format!(".dsh-studio-stage-{}", transaction.id)),
        );
        let _ = self.rollback(&transaction.id);
        Err(WorkbenchError::new(
            "profile_compose_failed",
            "工作台组件组合失败，已恢复原配置",
        ))
    }

    fn apply_links(
        &self,
        transaction: &CompositionTransaction,
        transaction_dir: &Path,
        owned_packages: &BTreeSet<String>,
        enabled: &[&super::model::LockedComponent],
    ) -> Result<(), WorkbenchError> {
        let stage = self
            .node_modules()
            .join(format!(".dsh-studio-stage-{}", transaction.id));
        std::fs::create_dir_all(&stage)
            .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法准备组件链接"))?;
        for component in enabled {
            create_link_or_copy(
                &self.assets.join(&component.artifact_path),
                &stage.join(&component.package),
            )?;
        }
        for package in owned_packages {
            validate_package_name(package)?;
            let current = self.node_modules().join(package);
            if current.symlink_metadata().is_ok() {
                std::fs::rename(&current, transaction_dir.join("links").join(package)).map_err(
                    |_| WorkbenchError::new("profile_compose_failed", "无法备份组件链接"),
                )?;
            }
        }
        for component in enabled {
            #[cfg(test)]
            if self.fail_link_for.as_deref() == Some(component.package.as_str()) {
                return Err(WorkbenchError::new(
                    "profile_compose_failed",
                    "测试注入的组件链接失败",
                ));
            }
            std::fs::rename(
                stage.join(&component.package),
                self.node_modules().join(&component.package),
            )
            .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法启用组件链接"))?;
        }
        let _ = std::fs::remove_dir_all(stage);
        Ok(())
    }

    fn link_matches(&self, component: &super::model::LockedComponent) -> bool {
        let link = self.node_modules().join(&component.package);
        let target = self.assets.join(&component.artifact_path);
        link_matches_target(&link, &target)
    }

    pub fn rollback(&self, transaction_id: &str) -> Result<(), WorkbenchError> {
        let transaction_dir = self.transaction_dir(transaction_id)?;
        let record_raw = std::fs::read_to_string(transaction_dir.join("transaction.json"))
            .map_err(|_| WorkbenchError::new("rollback_missing", "组件回滚快照缺失"))?;
        let record: TransactionRecord = serde_json::from_str(&record_raw)
            .map_err(|_| WorkbenchError::new("rollback_unreadable", "组件回滚快照无法解析"))?;
        for package in &record.affected_packages {
            validate_package_name(package)?;
            remove_path(&self.node_modules().join(package))?;
        }
        let links = transaction_dir.join("links");
        if links.exists() {
            for entry in std::fs::read_dir(&links)
                .map_err(|_| WorkbenchError::new("rollback_failed", "无法读取组件链接快照"))?
            {
                let entry = entry
                    .map_err(|_| WorkbenchError::new("rollback_failed", "无法读取组件链接快照"))?;
                let package = entry.file_name().to_string_lossy().to_string();
                validate_package_name(&package)?;
                std::fs::rename(entry.path(), self.node_modules().join(package))
                    .map_err(|_| WorkbenchError::new("rollback_failed", "无法恢复组件链接"))?;
            }
        }
        restore_file(
            &transaction_dir.join("profile-package.json"),
            &self.package_path(),
            record.had_package,
        )?;
        restore_file(
            &transaction_dir.join("managed.json"),
            &self.managed_path(),
            record.had_managed,
        )?;
        Ok(())
    }

    pub fn discard(&self, transaction_id: &str) -> Result<(), WorkbenchError> {
        let directory = self.transaction_dir(transaction_id)?;
        if directory.exists() {
            std::fs::remove_dir_all(directory)
                .map_err(|_| WorkbenchError::new("discard_failed", "无法清理旧组件回滚快照"))?;
        }
        Ok(())
    }
}

fn validate_package_name(package: &str) -> Result<(), WorkbenchError> {
    if package.is_empty()
        || package == "."
        || package == ".."
        || package.contains('/')
        || package.contains('\\')
        || !package
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(WorkbenchError::new(
            "unsupported_package_name",
            "组件包名暂不支持",
        ));
    }
    Ok(())
}

fn default_manifest() -> &'static str {
    r#"{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } }
}
"#
}

fn pretty_json(value: &impl Serialize) -> Result<Vec<u8>, WorkbenchError> {
    let mut bytes = serde_json::to_vec_pretty(value)
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法编码组件配置"))?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn profile_matches(raw: &str, expected: &serde_json::Value) -> bool {
    serde_json::from_str::<serde_json::Value>(raw).is_ok_and(|current| current == *expected)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), WorkbenchError> {
    let parent = path
        .parent()
        .ok_or_else(|| WorkbenchError::new("profile_compose_failed", "组件配置路径无效"))?;
    std::fs::create_dir_all(parent)
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法创建组件配置目录"))?;
    let temporary = parent.join(format!(".write-{}.tmp", uuid::Uuid::new_v4().simple()));
    let mut file = std::fs::File::create(&temporary)
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法写入组件配置"))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法保存组件配置"))?;
    replace_file(&temporary, path)
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    std::fs::rename(source, destination)
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法切换组件配置"))
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    let backup = destination.with_extension("previous");
    let existed = destination.exists();
    if existed {
        let _ = std::fs::remove_file(&backup);
        std::fs::rename(destination, &backup)
            .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法备份组件配置"))?;
    }
    if std::fs::rename(source, destination).is_err() {
        if existed {
            let _ = std::fs::rename(&backup, destination);
        }
        return Err(WorkbenchError::new(
            "profile_compose_failed",
            "无法切换组件配置",
        ));
    }
    if existed {
        let _ = std::fs::remove_file(backup);
    }
    Ok(())
}

fn restore_file(snapshot: &Path, destination: &Path, existed: bool) -> Result<(), WorkbenchError> {
    if existed {
        let bytes = std::fs::read(snapshot)
            .map_err(|_| WorkbenchError::new("rollback_failed", "组件回滚文件缺失"))?;
        atomic_write(destination, &bytes)
    } else {
        if destination.exists() {
            std::fs::remove_file(destination)
                .map_err(|_| WorkbenchError::new("rollback_failed", "无法移除新组件配置"))?;
        }
        Ok(())
    }
}

fn remove_path(path: &Path) -> Result<(), WorkbenchError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(WorkbenchError::new("rollback_failed", "无法检查组件链接")),
    };
    if metadata.file_type().is_symlink() || metadata.is_file() {
        std::fs::remove_file(path)
            .map_err(|_| WorkbenchError::new("rollback_failed", "无法移除组件链接"))
    } else if metadata.is_dir() {
        std::fs::remove_dir_all(path)
            .map_err(|_| WorkbenchError::new("rollback_failed", "无法移除组件目录"))
    } else {
        Err(WorkbenchError::new(
            "rollback_failed",
            "组件链接类型不受支持",
        ))
    }
}

#[cfg(unix)]
fn create_link_or_copy(source: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    std::os::unix::fs::symlink(source, destination)
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法创建组件链接"))
}

#[cfg(windows)]
fn create_link_or_copy(source: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    copy_directory(source, destination)
}

#[cfg(windows)]
fn copy_directory(source: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    let metadata = std::fs::symlink_metadata(source)
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "组件资源缺失"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(WorkbenchError::new(
            "profile_compose_failed",
            "组件资源目录无效",
        ));
    }
    std::fs::create_dir_all(destination)
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法复制组件目录"))?;
    for entry in std::fs::read_dir(source)
        .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法读取组件目录"))?
    {
        let entry =
            entry.map_err(|_| WorkbenchError::new("profile_compose_failed", "无法读取组件目录"))?;
        let file_type = entry
            .file_type()
            .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法检查组件文件"))?;
        if file_type.is_symlink() {
            return Err(WorkbenchError::new(
                "profile_compose_failed",
                "组件包不能包含符号链接",
            ));
        }
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), target)
                .map_err(|_| WorkbenchError::new("profile_compose_failed", "无法复制组件文件"))?;
        } else {
            return Err(WorkbenchError::new(
                "profile_compose_failed",
                "组件包包含不支持的文件",
            ));
        }
    }
    Ok(())
}

#[cfg(unix)]
fn link_matches_target(link: &Path, target: &Path) -> bool {
    let Ok(metadata) = std::fs::symlink_metadata(link) else {
        return false;
    };
    if !metadata.file_type().is_symlink() {
        return false;
    }
    let Ok(actual) = std::fs::read_link(link) else {
        return false;
    };
    actual.canonicalize().ok() == target.canonicalize().ok()
}

#[cfg(windows)]
fn link_matches_target(link: &Path, target: &Path) -> bool {
    super::artifact::hash_tree(link).ok() == super::artifact::hash_tree(target).ok()
}
