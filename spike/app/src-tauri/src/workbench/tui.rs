use std::io::Write;
use std::path::{Path, PathBuf};

use super::WorkbenchError;

pub struct TuiLauncherPaths<'a> {
    pub script: &'a Path,
    pub node: &'a Path,
    pub dsh_bin_dir: &'a Path,
    pub dsh_entry: &'a Path,
    pub dsh_home: &'a Path,
    pub profile_bin: &'a Path,
    pub workspace: &'a Path,
}

pub fn prepare_tui_launcher(paths: &TuiLauncherPaths<'_>) -> Result<PathBuf, WorkbenchError> {
    for path in [
        paths.node,
        paths.dsh_bin_dir,
        paths.dsh_entry,
        paths.dsh_home,
        paths.profile_bin,
        paths.workspace,
    ] {
        if !path.is_absolute() {
            return Err(WorkbenchError::new(
                "tui_path_invalid",
                "TUI 启动路径必须是绝对路径",
            ));
        }
    }
    if !paths.node.is_file() || !paths.dsh_entry.is_file() || !paths.profile_bin.is_file() {
        return Err(WorkbenchError::new(
            "tui_runtime_missing",
            "TUI 或 DSH 运行时文件缺失",
        ));
    }
    let parent = paths
        .script
        .parent()
        .ok_or_else(|| WorkbenchError::new("tui_path_invalid", "TUI 启动脚本路径无效"))?;
    std::fs::create_dir_all(parent)
        .map_err(|_| WorkbenchError::new("tui_launcher_failed", "无法创建 TUI 启动目录"))?;

    #[cfg(not(windows))]
    let body = format!(
        "#!/bin/zsh\nexport DSH_HOME={}\nexport DSH_STUDIO_DSH_ENTRY={}\nexport PATH={}:{}:\"$PATH\"\ncd {}\nexec {} {}\n",
        shell_quote(paths.dsh_home),
        shell_quote(paths.dsh_entry),
        shell_quote(paths.node.parent().unwrap_or(paths.node)),
        shell_quote(paths.dsh_bin_dir),
        shell_quote(paths.workspace),
        shell_quote(paths.node),
        shell_quote(paths.profile_bin),
    );
    #[cfg(windows)]
    let body = format!(
        "@echo off\r\nset \"DSH_HOME={}\"\r\nset \"DSH_STUDIO_DSH_ENTRY={}\"\r\nset \"PATH={};{};%PATH%\"\r\ncd /d \"{}\"\r\n\"{}\" \"{}\"\r\n",
        paths.dsh_home.display(),
        paths.dsh_entry.display(),
        paths.node.parent().unwrap_or(paths.node).display(),
        paths.dsh_bin_dir.display(),
        paths.workspace.display(),
        paths.node.display(),
        paths.profile_bin.display(),
    );

    let temporary = parent.join(format!(".tui-launch-{}.tmp", uuid::Uuid::new_v4().simple()));
    let mut file = std::fs::File::create(&temporary)
        .map_err(|_| WorkbenchError::new("tui_launcher_failed", "无法写入 TUI 启动脚本"))?;
    file.write_all(body.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|_| WorkbenchError::new("tui_launcher_failed", "无法保存 TUI 启动脚本"))?;
    drop(file);
    set_executable(&temporary)?;
    replace_launcher(&temporary, paths.script)?;
    Ok(paths.script.to_path_buf())
}

fn replace_launcher(temporary: &Path, destination: &Path) -> Result<(), WorkbenchError> {
    let backup = destination.with_file_name(format!(
        ".tui-launch-{}.previous",
        uuid::Uuid::new_v4().simple()
    ));
    let had_destination = destination.exists();
    if had_destination {
        std::fs::rename(destination, &backup)
            .map_err(|_| WorkbenchError::new("tui_launcher_failed", "无法备份已有 TUI 启动脚本"))?;
    }
    if std::fs::rename(temporary, destination).is_err() {
        if had_destination {
            let _ = std::fs::rename(&backup, destination);
        }
        let _ = std::fs::remove_file(temporary);
        return Err(WorkbenchError::new(
            "tui_launcher_failed",
            "无法启用 TUI 启动脚本",
        ));
    }
    if had_destination {
        let _ = std::fs::remove_file(backup);
    }
    Ok(())
}

#[cfg(not(windows))]
fn shell_quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), WorkbenchError> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
        .map_err(|_| WorkbenchError::new("tui_launcher_failed", "无法设置 TUI 启动权限"))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), WorkbenchError> {
    Ok(())
}
