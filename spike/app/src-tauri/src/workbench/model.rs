use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const LOCK_SCHEMA_VERSION: u32 = 1;
pub const STATE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkbenchMode {
    Normal,
    Safe,
}

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
pub enum ComponentHealth {
    Active,
    Disabled,
    SafeModeDisabled,
    Damaged,
    Restarting,
}

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedLaunch {
    pub id: String,
    pub mode: WorkbenchMode,
    pub transaction_id: Option<String>,
}
