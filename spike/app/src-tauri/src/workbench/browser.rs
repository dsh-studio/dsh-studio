use std::path::{Path, PathBuf};

use super::WorkbenchError;

pub fn prepare_browser_extension(
    source: &Path,
    destination_root: &Path,
    expected_version: &str,
) -> Result<PathBuf, WorkbenchError> {
    let metadata = std::fs::symlink_metadata(source)
        .map_err(|_| WorkbenchError::new("browser_extension_missing", "浏览器扩展文件缺失"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(WorkbenchError::new(
            "browser_extension_invalid",
            "浏览器扩展目录无效",
        ));
    }
    let manifest_raw = std::fs::read_to_string(source.join("manifest.json"))
        .map_err(|_| WorkbenchError::new("browser_extension_invalid", "浏览器扩展清单缺失"))?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_raw)
        .map_err(|_| WorkbenchError::new("browser_extension_invalid", "浏览器扩展清单无法解析"))?;
    if manifest.get("version").and_then(|value| value.as_str()) != Some(expected_version) {
        return Err(WorkbenchError::new(
            "browser_extension_version",
            "浏览器扩展版本与锁定清单不一致",
        ));
    }

    std::fs::create_dir_all(destination_root).map_err(|_| {
        WorkbenchError::new("browser_extension_prepare_failed", "无法创建浏览器扩展目录")
    })?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let stage = destination_root.join(format!(".stage-{id}"));
    let backup = destination_root.join(format!(".previous-{id}"));
    let destination = destination_root.join(expected_version);
    if let Err(error) = copy_tree(source, &stage) {
        let _ = std::fs::remove_dir_all(&stage);
        return Err(error);
    }
    let had_destination = destination.exists();
    if had_destination {
        std::fs::rename(&destination, &backup).map_err(|_| {
            WorkbenchError::new("browser_extension_prepare_failed", "无法备份已有浏览器扩展")
        })?;
    }
    if std::fs::rename(&stage, &destination).is_err() {
        if had_destination {
            let _ = std::fs::rename(&backup, &destination);
        }
        let _ = std::fs::remove_dir_all(&stage);
        return Err(WorkbenchError::new(
            "browser_extension_prepare_failed",
            "无法启用浏览器扩展",
        ));
    }
    if had_destination {
        let _ = std::fs::remove_dir_all(backup);
    }
    Ok(destination)
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    std::fs::create_dir_all(destination).map_err(|_| {
        WorkbenchError::new("browser_extension_prepare_failed", "无法准备浏览器扩展")
    })?;
    for entry in std::fs::read_dir(source)
        .map_err(|_| WorkbenchError::new("browser_extension_invalid", "无法读取浏览器扩展"))?
    {
        let entry = entry
            .map_err(|_| WorkbenchError::new("browser_extension_invalid", "无法读取浏览器扩展"))?;
        let kind = entry.file_type().map_err(|_| {
            WorkbenchError::new("browser_extension_invalid", "无法检查浏览器扩展文件")
        })?;
        if kind.is_symlink() {
            return Err(WorkbenchError::new(
                "browser_extension_symlink",
                "浏览器扩展中不允许符号链接",
            ));
        }
        let target = destination.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            std::fs::copy(entry.path(), target).map_err(|_| {
                WorkbenchError::new("browser_extension_prepare_failed", "无法复制浏览器扩展")
            })?;
        } else {
            return Err(WorkbenchError::new(
                "browser_extension_invalid",
                "浏览器扩展包含不支持的文件类型",
            ));
        }
    }
    Ok(())
}
