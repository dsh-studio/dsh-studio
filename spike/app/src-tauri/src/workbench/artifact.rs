use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

use super::model::{LockedComponent, WorkbenchLock, WorkbenchMode, LOCK_SCHEMA_VERSION};
use super::WorkbenchError;

fn path_error(code: &'static str, message: &'static str) -> WorkbenchError {
    WorkbenchError::new(code, message)
}

fn safe_relative(path: &str, code: &'static str) -> Result<PathBuf, WorkbenchError> {
    let value = Path::new(path);
    if value.as_os_str().is_empty()
        || value.is_absolute()
        || value.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(path_error(code, "组件资源路径不安全"));
    }
    Ok(value.to_path_buf())
}

fn normalized_relative(root: &Path, path: &Path) -> Result<String, WorkbenchError> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| path_error("artifact_path_escape", "组件资源超出应用目录"))?;
    Ok(relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn collect_regular_files(
    root: &Path,
    current: &Path,
    files: &mut Vec<PathBuf>,
) -> Result<(), WorkbenchError> {
    let entries = std::fs::read_dir(current)
        .map_err(|_| path_error("artifact_read_failed", "无法读取组件目录"))?;
    for entry in entries {
        let entry = entry.map_err(|_| path_error("artifact_read_failed", "无法读取组件目录"))?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|_| path_error("artifact_read_failed", "无法读取组件文件"))?;
        if metadata.file_type().is_symlink() {
            return Err(path_error("artifact_symlink", "组件包不能包含符号链接"));
        }
        if metadata.is_dir() {
            collect_regular_files(root, &path, files)?;
        } else if metadata.is_file() {
            normalized_relative(root, &path)?;
            files.push(path);
        } else {
            return Err(path_error(
                "artifact_special_file",
                "组件包包含不支持的文件",
            ));
        }
    }
    Ok(())
}

pub fn hash_tree(root: &Path) -> Result<String, WorkbenchError> {
    let metadata = std::fs::symlink_metadata(root)
        .map_err(|_| path_error("artifact_missing", "组件文件缺失"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(path_error("artifact_invalid", "组件资源目录无效"));
    }
    let mut files = Vec::new();
    collect_regular_files(root, root, &mut files)?;
    files.sort_by_key(|path| normalized_relative(root, path).unwrap_or_default());
    let mut hash = Sha256::new();
    for path in files {
        let relative = normalized_relative(root, &path)?;
        let bytes = std::fs::read(&path)
            .map_err(|_| path_error("artifact_read_failed", "无法读取组件文件"))?;
        hash.update(relative.as_bytes());
        hash.update([0]);
        hash.update(bytes.len().to_string().as_bytes());
        hash.update([0]);
        hash.update(bytes);
    }
    Ok(format!("sha256:{:x}", hash.finalize()))
}

fn is_lower_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn non_empty(values: &[String]) -> bool {
    !values.is_empty() && values.iter().all(|value| !value.trim().is_empty())
}

pub fn load_lock_structure(root: &Path) -> Result<WorkbenchLock, WorkbenchError> {
    let raw = std::fs::read_to_string(root.join("workbench.lock.json"))
        .map_err(|_| path_error("lock_missing", "工作台组件清单缺失"))?;
    let lock: WorkbenchLock = serde_json::from_str(&raw)
        .map_err(|_| path_error("lock_unreadable", "工作台组件清单无法解析"))?;
    if lock.schema_version != LOCK_SCHEMA_VERSION || !is_lower_hex(&lock.generation, 64) {
        return Err(path_error("lock_schema", "工作台组件清单版本无效"));
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|_| path_error("lock_root_missing", "工作台资源目录缺失"))?;
    let mut ids = BTreeSet::new();
    let mut packages = BTreeSet::new();
    for component in &lock.components {
        if !ids.insert(component.id.as_str()) || !packages.insert(component.package.as_str()) {
            return Err(path_error("duplicate_component", "工作台组件标识重复"));
        }
        if component.id.trim().is_empty()
            || component.display_name.trim().is_empty()
            || component.description.trim().is_empty()
            || component.package.trim().is_empty()
            || component.version.trim().is_empty()
            || component.source.trim().is_empty()
            || component.license.trim().is_empty()
            || !component.profiles.iter().any(|profile| profile == "web")
            || !non_empty(&component.bundle_entrypoints)
            || !component.artifact_sha256.starts_with("sha256:")
            || !is_lower_hex(&component.artifact_sha256[7..], 64)
        {
            return Err(path_error("invalid_component", "工作台组件声明无效"));
        }

        let artifact_relative = safe_relative(&component.artifact_path, "artifact_path_escape")?;
        let notice_relative = safe_relative(&component.notice, "notice_path_escape")?;
        for (relative, code, message) in [
            (
                artifact_relative,
                "artifact_path_escape",
                "组件资源超出应用目录",
            ),
            (
                notice_relative,
                "notice_path_escape",
                "组件许可文件超出应用目录",
            ),
        ] {
            let candidate = root.join(relative);
            let canonical = candidate
                .canonicalize()
                .map_err(|_| path_error(code, "组件资源文件缺失"))?;
            canonical
                .strip_prefix(&canonical_root)
                .map_err(|_| path_error(code, message))?;
        }
    }
    Ok(lock)
}

pub fn verify_component_artifact(
    root: &Path,
    component: &LockedComponent,
) -> Result<(), WorkbenchError> {
    let artifact = root.join(safe_relative(
        &component.artifact_path,
        "artifact_path_escape",
    )?);
    let package_raw = std::fs::read_to_string(artifact.join("package.json"))
        .map_err(|_| path_error("package_missing", "组件 package.json 缺失"))?;
    let package: serde_json::Value = serde_json::from_str(&package_raw)
        .map_err(|_| path_error("package_unreadable", "组件 package.json 无法解析"))?;
    if package.get("name").and_then(|value| value.as_str()) != Some(&component.package)
        || package.get("version").and_then(|value| value.as_str()) != Some(&component.version)
    {
        return Err(path_error("package_identity_mismatch", "组件包身份不匹配"));
    }
    if hash_tree(&artifact)? != component.artifact_sha256 {
        return Err(path_error("artifact_hash_mismatch", "组件文件校验失败"));
    }
    Ok(())
}

pub fn load_verified_lock(root: &Path) -> Result<WorkbenchLock, WorkbenchError> {
    let lock = load_lock_structure(root)?;
    for component in &lock.components {
        verify_component_artifact(root, component)?;
    }
    Ok(lock)
}

pub fn resolve_enabled<'a>(
    lock: &'a WorkbenchLock,
    desired: &BTreeMap<String, bool>,
    mode: WorkbenchMode,
) -> Result<Vec<&'a LockedComponent>, WorkbenchError> {
    let enabled = lock
        .components
        .iter()
        .filter(|component| match mode {
            WorkbenchMode::Safe => component.required && component.safe_mode,
            WorkbenchMode::Normal => {
                component.required
                    || desired
                        .get(&component.id)
                        .copied()
                        .unwrap_or(component.default_enabled)
            }
        })
        .collect::<Vec<_>>();
    let mut owners = BTreeMap::<&str, &str>::new();
    for component in &enabled {
        for group in &component.conflict_groups {
            if let Some(previous) = owners.insert(group, &component.id) {
                return Err(WorkbenchError::new(
                    "component_conflict",
                    format!("组件 {} 与 {} 不能同时启用", previous, component.id),
                ));
            }
        }
    }
    Ok(enabled)
}
