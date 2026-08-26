use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use super::artifact::{load_lock_structure, verify_component_artifact};
use super::composer::ProfileComposer;
use super::model::{
    ComponentHealth, ComponentView, PreparedLaunch, WorkbenchCatalog, WorkbenchLock, WorkbenchMode,
};
use super::state::StateStore;
use super::WorkbenchError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryAction {
    LaunchSafeMode,
    Stop,
}

struct ServiceState {
    assets_root: PathBuf,
    lock: WorkbenchLock,
    state_store: StateStore,
    composer: ProfileComposer,
    mode: WorkbenchMode,
    pending: Option<PreparedLaunch>,
    rollback_transaction: Option<String>,
    rolled_back: bool,
    recovery_attempted: bool,
    artifact_errors: BTreeMap<String, String>,
}

pub struct WorkbenchService {
    inner: Mutex<ServiceState>,
}

impl WorkbenchService {
    pub fn new(
        assets_root: PathBuf,
        home: PathBuf,
        data_root: PathBuf,
    ) -> Result<Self, WorkbenchError> {
        let lock = load_lock_structure(&assets_root)?;
        let artifact_errors = verify_artifacts(&assets_root, &lock);
        reject_required_damage(&lock, &artifact_errors)?;
        let state_store = StateStore::new(data_root.clone());
        state_store.load_or_initialize(&lock)?;
        Ok(Self {
            inner: Mutex::new(ServiceState {
                assets_root: assets_root.clone(),
                lock,
                state_store,
                composer: ProfileComposer::new(home, assets_root, data_root),
                mode: WorkbenchMode::Normal,
                pending: None,
                rollback_transaction: None,
                rolled_back: false,
                recovery_attempted: false,
                artifact_errors,
            }),
        })
    }

    pub fn catalog(&self) -> Result<WorkbenchCatalog, WorkbenchError> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| WorkbenchError::new("workbench_unavailable", "工作台组件服务暂不可用"))?;
        catalog_from(&inner)
    }

    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<WorkbenchCatalog, WorkbenchError> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| WorkbenchError::new("workbench_unavailable", "工作台组件服务暂不可用"))?;
        inner.state_store.set_desired(&inner.lock, id, enabled)?;
        catalog_from(&inner)
    }

    pub fn repair(&self) -> Result<WorkbenchCatalog, WorkbenchError> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| WorkbenchError::new("workbench_unavailable", "工作台组件服务暂不可用"))?;
        inner.artifact_errors = verify_artifacts(&inner.assets_root, &inner.lock);
        reject_required_damage(&inner.lock, &inner.artifact_errors)?;
        catalog_from(&inner)
    }

    pub fn prepare_launch(&self, mode: WorkbenchMode) -> Result<PreparedLaunch, WorkbenchError> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| WorkbenchError::new("workbench_unavailable", "工作台组件服务暂不可用"))?;
        if inner.pending.is_some() {
            return Err(WorkbenchError::new("launch_in_progress", "工作台正在启动"));
        }
        inner.artifact_errors = verify_artifacts(&inner.assets_root, &inner.lock);
        reject_required_damage(&inner.lock, &inner.artifact_errors)?;
        let state = inner.state_store.load_or_initialize(&inner.lock)?;
        let mut effective_desired = state.desired;
        for component_id in inner.artifact_errors.keys() {
            effective_desired.insert(component_id.clone(), false);
        }
        let transaction = inner
            .composer
            .compose(&inner.lock, &effective_desired, mode)?;
        let launch = PreparedLaunch {
            id: uuid::Uuid::new_v4().to_string(),
            mode,
            transaction_id: transaction.changed.then_some(transaction.id),
        };
        inner.pending = Some(launch.clone());
        inner.mode = mode;
        Ok(launch)
    }

    pub fn mark_ready(&self, launch_id: &str) -> Result<(), WorkbenchError> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| WorkbenchError::new("workbench_unavailable", "工作台组件服务暂不可用"))?;
        let pending = take_matching_pending(&mut inner, launch_id)?;
        if pending.mode == WorkbenchMode::Normal {
            inner.state_store.promote_desired(&inner.lock)?;
        }
        if let Some(previous) = inner.rollback_transaction.take() {
            inner.composer.discard(&previous)?;
        }
        inner.rollback_transaction = pending.transaction_id;
        inner.mode = pending.mode;
        inner.recovery_attempted = false;
        Ok(())
    }

    pub fn mark_failed(
        &self,
        launch_id: &str,
        _reason: &str,
    ) -> Result<RecoveryAction, WorkbenchError> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| WorkbenchError::new("workbench_unavailable", "工作台组件服务暂不可用"))?;
        let pending = take_matching_pending(&mut inner, launch_id)?;
        if let Some(transaction) = pending.transaction_id {
            inner.composer.rollback(&transaction)?;
            inner.composer.discard(&transaction)?;
        }
        inner.rolled_back = true;
        if pending.mode == WorkbenchMode::Normal {
            inner
                .state_store
                .rollback_desired("新组件启动失败，已恢复上一组可用组件")?;
            if !inner.recovery_attempted {
                inner.recovery_attempted = true;
                inner.mode = WorkbenchMode::Safe;
                return Ok(RecoveryAction::LaunchSafeMode);
            }
        }
        Ok(RecoveryAction::Stop)
    }
}

fn take_matching_pending(
    inner: &mut ServiceState,
    launch_id: &str,
) -> Result<PreparedLaunch, WorkbenchError> {
    if inner.pending.as_ref().map(|launch| launch.id.as_str()) != Some(launch_id) {
        return Err(WorkbenchError::new(
            "stale_launch",
            "忽略已过期的工作台启动结果",
        ));
    }
    Ok(inner
        .pending
        .take()
        .expect("matching pending launch exists"))
}

fn verify_artifacts(root: &std::path::Path, lock: &WorkbenchLock) -> BTreeMap<String, String> {
    lock.components
        .iter()
        .filter_map(|component| {
            verify_component_artifact(root, component)
                .err()
                .map(|error| (component.id.clone(), error.code().to_string()))
        })
        .collect()
}

fn reject_required_damage(
    lock: &WorkbenchLock,
    errors: &BTreeMap<String, String>,
) -> Result<(), WorkbenchError> {
    if lock
        .components
        .iter()
        .any(|component| component.required && errors.contains_key(&component.id))
    {
        return Err(WorkbenchError::new(
            "required_artifact_damaged",
            "DSH Studio 核心组件文件损坏，请重新安装应用",
        ));
    }
    Ok(())
}

fn catalog_from(inner: &ServiceState) -> Result<WorkbenchCatalog, WorkbenchError> {
    let state = inner.state_store.load_or_initialize(&inner.lock)?;
    let components = inner
        .lock
        .components
        .iter()
        .map(|component| {
            let enabled = component.required
                || state
                    .desired
                    .get(&component.id)
                    .copied()
                    .unwrap_or(component.default_enabled);
            let active = component.required
                || state
                    .active
                    .get(&component.id)
                    .copied()
                    .unwrap_or(component.default_enabled);
            let damaged = inner.artifact_errors.contains_key(&component.id);
            let effective_enabled = !damaged
                && match inner.mode {
                    WorkbenchMode::Normal => enabled,
                    WorkbenchMode::Safe => component.required && component.safe_mode,
                };
            let health = if damaged {
                ComponentHealth::Damaged
            } else if inner.mode == WorkbenchMode::Safe && !effective_enabled {
                ComponentHealth::SafeModeDisabled
            } else if enabled != active || inner.pending.is_some() {
                ComponentHealth::Restarting
            } else if effective_enabled {
                ComponentHealth::Active
            } else {
                ComponentHealth::Disabled
            };
            ComponentView {
                id: component.id.clone(),
                display_name: component.display_name.clone(),
                description: component.description.clone(),
                package: component.package.clone(),
                version: component.version.clone(),
                source: component.source.clone(),
                license: component.license.clone(),
                permissions: component.permissions.clone(),
                required: component.required,
                enabled,
                effective_enabled,
                health,
            }
        })
        .collect();
    Ok(WorkbenchCatalog {
        generation: inner.lock.generation.clone(),
        mode: inner.mode,
        rolled_back: inner.rolled_back,
        warning: state.warning,
        components,
    })
}
