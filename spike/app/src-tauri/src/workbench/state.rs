use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};

use super::model::{ComponentState, WorkbenchLock, STATE_SCHEMA_VERSION};
use super::WorkbenchError;

pub struct StateStore {
    root: PathBuf,
}

impl StateStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn path(&self) -> PathBuf {
        self.root.join("component-state.json")
    }

    fn default_state(lock: &WorkbenchLock) -> ComponentState {
        let values = lock
            .components
            .iter()
            .map(|component| {
                (
                    component.id.clone(),
                    component.required || component.default_enabled,
                )
            })
            .collect::<BTreeMap<_, _>>();
        ComponentState {
            schema_version: STATE_SCHEMA_VERSION,
            desired: values.clone(),
            active: values,
            warning: None,
        }
    }

    fn load_existing(&self) -> Result<ComponentState, WorkbenchError> {
        let raw = std::fs::read_to_string(self.path())
            .map_err(|_| WorkbenchError::new("state_unreadable", "工作台组件状态无法读取"))?;
        let state: ComponentState = serde_json::from_str(&raw)
            .map_err(|_| WorkbenchError::new("state_unreadable", "工作台组件状态无法解析"))?;
        if state.schema_version != STATE_SCHEMA_VERSION {
            return Err(WorkbenchError::new(
                "state_schema",
                "工作台组件状态版本暂不支持",
            ));
        }
        Ok(state)
    }

    pub fn load_or_initialize(
        &self,
        lock: &WorkbenchLock,
    ) -> Result<ComponentState, WorkbenchError> {
        if !self.path().exists() {
            let state = Self::default_state(lock);
            self.save(&state)?;
            return Ok(state);
        }
        let mut state = self.load_existing()?;
        let mut changed = false;
        for component in &lock.components {
            let default = component.required || component.default_enabled;
            if let std::collections::btree_map::Entry::Vacant(entry) =
                state.desired.entry(component.id.clone())
            {
                entry.insert(default);
                changed = true;
            }
            if let std::collections::btree_map::Entry::Vacant(entry) =
                state.active.entry(component.id.clone())
            {
                entry.insert(default);
                changed = true;
            }
            if component.required {
                if state.desired.insert(component.id.clone(), true) != Some(true) {
                    changed = true;
                }
                if state.active.insert(component.id.clone(), true) != Some(true) {
                    changed = true;
                }
            }
        }
        if changed {
            self.save(&state)?;
        }
        Ok(state)
    }

    pub fn save(&self, state: &ComponentState) -> Result<(), WorkbenchError> {
        std::fs::create_dir_all(&self.root)
            .map_err(|_| WorkbenchError::new("state_write_failed", "无法创建工作台状态目录"))?;
        let bytes = serde_json::to_vec_pretty(state)
            .map_err(|_| WorkbenchError::new("state_write_failed", "无法编码工作台状态"))?;
        let temporary = self.root.join(format!(
            ".component-state.{}.tmp",
            uuid::Uuid::new_v4().simple()
        ));
        let write_result = (|| -> Result<(), WorkbenchError> {
            let mut file = std::fs::File::create(&temporary)
                .map_err(|_| WorkbenchError::new("state_write_failed", "无法写入工作台状态"))?;
            file.write_all(&bytes)
                .and_then(|_| file.write_all(b"\n"))
                .and_then(|_| file.sync_all())
                .map_err(|_| WorkbenchError::new("state_write_failed", "无法保存工作台状态"))?;
            set_private_permissions(&temporary)?;
            replace_file(&temporary, &self.path())?;
            if let Ok(directory) = std::fs::File::open(&self.root) {
                let _ = directory.sync_all();
            }
            Ok(())
        })();
        if write_result.is_err() {
            let _ = std::fs::remove_file(&temporary);
        }
        write_result
    }

    pub fn set_desired(
        &self,
        lock: &WorkbenchLock,
        id: &str,
        enabled: bool,
    ) -> Result<ComponentState, WorkbenchError> {
        let component = lock
            .components
            .iter()
            .find(|component| component.id == id)
            .ok_or_else(|| WorkbenchError::new("unknown_component", "工作台组件不存在"))?;
        if component.required && !enabled {
            return Err(WorkbenchError::new(
                "required_component",
                "核心组件不能关闭",
            ));
        }
        let mut state = self.load_or_initialize(lock)?;
        state.desired.insert(id.to_string(), enabled);
        self.save(&state)?;
        Ok(state)
    }

    pub fn promote_desired(&self, lock: &WorkbenchLock) -> Result<ComponentState, WorkbenchError> {
        let mut state = self.load_or_initialize(lock)?;
        state.active = state.desired.clone();
        for component in &lock.components {
            if component.required {
                state.active.insert(component.id.clone(), true);
                state.desired.insert(component.id.clone(), true);
            }
        }
        state.warning = None;
        self.save(&state)?;
        Ok(state)
    }

    pub fn rollback_desired(&self, warning: &str) -> Result<ComponentState, WorkbenchError> {
        let mut state = self.load_existing()?;
        state.desired = state.active.clone();
        state.warning = Some(warning.chars().take(256).collect());
        self.save(&state)?;
        Ok(state)
    }
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> Result<(), WorkbenchError> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|_| WorkbenchError::new("state_write_failed", "无法设置工作台状态权限"))
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> Result<(), WorkbenchError> {
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    std::fs::rename(source, destination)
        .map_err(|_| WorkbenchError::new("state_write_failed", "无法切换工作台状态"))
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    let backup = destination.with_extension("json.previous");
    let had_destination = destination.exists();
    if had_destination {
        let _ = std::fs::remove_file(&backup);
        std::fs::rename(destination, &backup)
            .map_err(|_| WorkbenchError::new("state_write_failed", "无法备份工作台状态"))?;
    }
    if let Err(error) = std::fs::rename(source, destination) {
        if had_destination {
            let _ = std::fs::rename(&backup, destination);
        }
        return Err(WorkbenchError::new(
            "state_write_failed",
            format!("无法切换工作台状态: {error}"),
        ));
    }
    if had_destination {
        let _ = std::fs::remove_file(backup);
    }
    Ok(())
}
