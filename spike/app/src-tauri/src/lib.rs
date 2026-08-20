use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub mod theme;

use theme::commands::{
    theme_activate, theme_catalog, theme_delete, theme_discard_stage, theme_import_image,
    theme_load, theme_save,
};

struct RunningChild(Mutex<Option<Child>>);

#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
struct ModelConfig {
    kind: String,
    base_url: String,
    model: String,
    #[serde(default)]
    api_key_set: bool,
}

fn dsh_home(app: &AppHandle) -> Result<PathBuf, String> {
    // 开发期可用 DSH_STUDIO_HOME 指到任意目录;打包版落在 app data 目录
    if let Ok(h) = std::env::var("DSH_STUDIO_HOME") {
        let p = PathBuf::from(h);
        std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        return Ok(p);
    }
    let home = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dsh-home");
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    Ok(home)
}

/// 定位随应用分发的资源目录:env 覆盖 → 打包资源 → 源码树(开发运行)。
fn studio_asset_dir(
    app: &AppHandle,
    env_key: &str,
    name: &str,
    probe: &str,
) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var(env_key) {
        let p = PathBuf::from(p);
        if p.join(probe).exists() {
            return Ok(p);
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join(name);
        if p.join(probe).exists() {
            return Ok(p);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(name);
    if dev.join(probe).exists() {
        return dev.canonicalize().map_err(|e| e.to_string());
    }
    Err(format!(
        "{name} 资源缺失(找过 ${env_key}、应用资源目录、源码树)"
    ))
}

/// 平台各自的 node 可执行文件相对路径(Windows 发行版没有 bin/ 层)。
#[cfg(windows)]
const NODE_RELATIVE: &str = "node/node.exe";
#[cfg(not(windows))]
const NODE_RELATIVE: &str = "node/bin/node";

/// Windows 下隐藏子进程控制台窗口(CREATE_NO_WINDOW)。
#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
}
#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

/// 用户主目录(dsh 会话的默认工作区根)。
fn home_dir_fallback() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into())
}

fn runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    studio_asset_dir(app, "DSH_STUDIO_RUNTIME_DIR", "runtime", NODE_RELATIVE)
}

fn plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    studio_asset_dir(
        app,
        "DSH_STUDIO_PLUGINS_DIR",
        "plugins",
        "dsh-studio-brand/package.json",
    )
}

fn skills_dir(app: &AppHandle) -> Result<PathBuf, String> {
    studio_asset_dir(
        app,
        "DSH_STUDIO_SKILLS_DIR",
        "skills",
        "file-organizer-zh/SKILL.md",
    )
}

fn theme_service(app: &AppHandle) -> Result<theme::ThemeService, String> {
    let data_root = if let Ok(path) = std::env::var("DSH_STUDIO_THEME_DIR") {
        PathBuf::from(path)
    } else {
        app.path()
            .app_data_dir()
            .map_err(|_| "无法定位主题数据目录".to_string())?
            .join("themes")
    };

    let themes_root = if let Ok(path) = std::env::var("DSH_STUDIO_THEMES_DIR") {
        PathBuf::from(path)
    } else if let Ok(resources) = app.path().resource_dir() {
        let candidate = resources.join("themes");
        if candidate.join("presets").exists() {
            candidate
        } else {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../themes")
        }
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../themes")
    };
    let bundled_root = if themes_root.join("presets").exists() {
        themes_root.join("presets")
    } else {
        themes_root
    };
    theme::ThemeService::new(bundled_root, data_root).map_err(|error| error.to_string())
}

/// DSH Studio 自带的 profile 插件,顺序即 bundles 层顺序。
const STUDIO_PLUGINS: [&str; 4] = [
    "dsh-studio-brand",
    "dsh-studio-providers",
    "dsh-studio-themes",
    "dsh-studio-skills-panel",
];

/// 把 DSH Studio 插件接进 web profile:package.json 声明 bundles,node_modules
/// 放符号链接。等价于 `dsh plugin --profile web add`,但不依赖 pnpm。
/// 清单做**合并**而不是"存在即跳过":应用升级新增的自带插件要能进到老清单里,
/// 同时保留用户后装的条目;link 路径每次校准,升级换位后仍指向当前资源。
fn provision_web_profile(home: &Path, plugins: &Path) -> Result<(), String> {
    let profile = home.join("profiles/web");
    let nm = profile.join("node_modules");
    std::fs::create_dir_all(&nm).map_err(|e| e.to_string())?;
    let pkg = profile.join("package.json");

    let mut manifest: serde_json::Value = if pkg.exists() {
        let raw = std::fs::read_to_string(&pkg).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| format!("profile package.json 解析失败: {e}"))?
    } else {
        serde_json::json!({
            "name": "dsh-profile-web",
            "private": true,
            "dependencies": {},
            "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } }
        })
    };

    {
        let root = manifest
            .as_object_mut()
            .ok_or("profile package.json 不是对象")?;
        let deps = root
            .entry("dependencies")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or("dependencies 不是对象")?;
        for name in STUDIO_PLUGINS {
            let link = format!("link:{}", plugins.join(name).display());
            deps.insert(name.to_string(), serde_json::Value::String(link));
        }
    }
    {
        let root = manifest
            .as_object_mut()
            .ok_or("profile package.json 不是对象")?;
        let bundles = root
            .entry("dsh")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or("dsh 不是对象")?
            .entry("profile")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or("dsh.profile 不是对象")?
            .entry("bundles")
            .or_insert_with(|| {
                serde_json::json!(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"])
            })
            .as_array_mut()
            .ok_or("bundles 不是数组")?;
        for name in STUDIO_PLUGINS {
            if !bundles.iter().any(|v| v.as_str() == Some(name)) {
                bundles.push(serde_json::Value::String(name.to_string()));
            }
        }
    }

    let rendered = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(&pkg, rendered + "\n").map_err(|e| e.to_string())?;

    for name in STUDIO_PLUGINS {
        replace_symlink(&plugins.join(name), &nm.join(name))?;
    }
    Ok(())
}

/// 把自带中文技能接进 DSH_HOME/skills(skill-filesystem 的发现目录)。
/// 只补缺不覆盖:用户改过或自装的同名技能保持原样。
fn provision_skills(home: &Path, skills: &Path) -> Result<(), String> {
    let target = home.join("skills");
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    let entries = std::fs::read_dir(skills).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let link = target.join(entry.file_name());
        if link.symlink_metadata().is_ok() {
            continue;
        }
        replace_symlink(&entry.path(), &link)?;
    }
    Ok(())
}

/// 建立(或重建)指向资源目录的符号链接。Windows 普通用户没有符号链接权限
/// (要开发者模式),失败时退化为整目录复制——插件/技能都是 KB 级文本,
/// 每次启动重建的成本可忽略。
fn replace_symlink(src: &Path, link: &Path) -> Result<(), String> {
    if link.symlink_metadata().is_ok() {
        std::fs::remove_file(link)
            .or_else(|_| std::fs::remove_dir_all(link))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(src, link).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    if std::os::windows::fs::symlink_dir(src, link).is_err() {
        copy_dir_recursive(src, link)?;
    }
    Ok(())
}

/// Windows 符号链接兜底:递归复制目录。
#[cfg(windows)]
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 启动 `dsh web`(loopback、OS 挑空闲端口),从 stdout 解析就绪 URL 后把主窗口
/// 导航过去。stdout/stderr 同时转发成 `dsh-line` 事件给启动页显示。
fn spawn_web_host(app: &AppHandle) -> Result<(), String> {
    let rt = runtime_dir(app)?;
    let node = rt.join(NODE_RELATIVE);
    let entry = rt.join("app/node_modules/@deepseek-ai/dsh/lib/bin.js");
    let home = dsh_home(app)?;
    let workdir = home_dir_fallback();
    let mut command = Command::new(&node);
    command
        .arg(&entry)
        .args(["web", "--host", "127.0.0.1", "--port", "0"])
        .current_dir(&workdir)
        .env("DSH_HOME", &home)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut command);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    *app.state::<RunningChild>().0.lock().unwrap() = Some(child);

    let app_err = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            eprintln!("[dsh:err] {line}");
            let _ = app_err.emit("dsh-line", format!("[err] {line}"));
        }
    });

    let app_out = app.clone();
    std::thread::spawn(move || {
        let mut navigated = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            println!("[dsh] {line}");
            let _ = app_out.emit("dsh-line", line.clone());
            if !navigated {
                if let Some(url) = line.strip_prefix("dsh web: ") {
                    if let Ok(parsed) = tauri::Url::parse(url.trim()) {
                        navigated = true;
                        println!("[studio] host ready at {parsed}");
                        ensure_navigated(&app_out, parsed);
                    }
                }
            }
        }
        let _ = app_out.emit("dsh-line", "[exit]".to_string());
    });
    Ok(())
}

/// 把主窗口导航到 host,并在 15 秒内每秒校验一次。单发 navigate 会和启动页
/// 尚未提交的初始加载竞态(启动页后到,覆盖我们的导航,窗口永远停在加载页),
/// 所以这里用幂等看门狗:URL 已在 host 上就不动,否则补一次导航。
fn ensure_navigated(app: &AppHandle, target: tauri::Url) {
    let app = app.clone();
    std::thread::spawn(move || {
        for _ in 0..15 {
            let handle = app.clone();
            let wanted = target.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(w) = handle.get_webview_window("main") {
                    let on_host = w.url().ok().is_some_and(|u| {
                        u.host_str() == wanted.host_str() && u.port() == wanted.port()
                    });
                    if !on_host {
                        let _ = w.navigate(wanted);
                    }
                }
            });
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    });
}

/// 应用启动序列:校准 profile 和技能 → 拉起 host。失败时留在启动页并显示原因。
fn start_studio(app: &AppHandle) -> Result<(), String> {
    let home = dsh_home(app)?;
    provision_web_profile(&home, &plugins_dir(app)?)?;
    provision_skills(&home, &skills_dir(app)?)?;
    spawn_web_host(app)
}

const HEADLESS_PROFILE_PKG: &str = r#"{
  "name": "dsh-profile-headless",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"] } }
}
"#;

#[tauri::command]
fn save_model_config(
    app: AppHandle,
    kind: String,
    base_url: String,
    model: String,
    api_key: String,
) -> Result<(), String> {
    let home = dsh_home(&app)?;
    let profile = home.join("profiles/headless");
    std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
    let pkg = profile.join("package.json");
    if !pkg.exists() {
        std::fs::write(&pkg, HEADLESS_PROFILE_PKG).map_err(|e| e.to_string())?;
    }

    // 密钥写 $DSH_HOME/.env(仅本机);留空则保留现有密钥
    if !api_key.is_empty() {
        let env_line = if kind == "deepseek" {
            format!("DEEPSEEK_API_KEY={api_key}\n")
        } else {
            format!("STUDIO_API_KEY={api_key}\n")
        };
        std::fs::write(home.join(".env"), env_line).map_err(|e| e.to_string())?;
    }

    // DSH Studio 人设:替换 dsh 默认的 "coding agent" persona(order-0 部署段,纯配置可换)
    const PERSONA: &str = "你是小浣熊,DSH Studio 里的桌面数字同事,在用户的电脑上直接动手干活(工作目录 {{cwd}},这是给你的信息,除非用户问起,不要主动复述)。说话像个靠谱的同事:自然、简洁、说人话,用简体中文。不要在问候或回答里背诵自己的能力清单和配置信息;用户问你能干什么时,结合他的场景举两三个例子即可。干活的规矩:回答先给结果再给说明;动文件(写/改/删)之前先用一句话说明打算;需求含糊就先问清;做完用一两句话交代结果,不写总结套话。";
    let persona_patch = format!("- id: system-prompt\n  config:\n    persona: \"{PERSONA}\"\n");

    // 生成 pi-ai 路由 patch(DeepSeek 官方走内置路由,只需改默认模型)
    let patch = match kind.as_str() {
        "deepseek" => {
            if model.is_empty() {
                persona_patch
            } else {
                format!(
                    "{persona_patch}- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: {model}\n"
                )
            }
        }
        _ => {
            let api = if kind == "anthropic" {
                "anthropic-messages"
            } else {
                "openai-completions"
            };
            format!(
                "{persona_patch}- id: llm-pi-ai\n  config:\n    providers:\n      studio:\n        displayName: 我的模型\n        apiKeyEnv: STUDIO_API_KEY\n        api: {api}\n        baseURL: {base_url}\n        models:\n          - id: {model}\n            contextWindow: 131072\n            maxTokens: 8192\n- id: agent-default-model\n  config:\n    provider: studio\n    model: {model}\n"
            )
        }
    };
    std::fs::write(profile.join("cordis.patch.yml"), patch).map_err(|e| e.to_string())?;

    let cfg = ModelConfig {
        kind,
        base_url,
        model,
        api_key_set: true,
    };
    std::fs::write(
        home.join("studio-model.json"),
        serde_json::to_string(&cfg).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_model_config(app: AppHandle) -> Result<Option<ModelConfig>, String> {
    let home = dsh_home(&app)?;
    let p = home.join("studio-model.json");
    if !p.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let mut cfg: ModelConfig = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    cfg.api_key_set = home.join(".env").exists();
    Ok(Some(cfg))
}

#[tauri::command]
fn run_dsh(
    app: AppHandle,
    state: State<RunningChild>,
    args: Vec<String>,
    mode: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    if let Some(mut old) = state.0.lock().unwrap().take() {
        let _ = old.kill();
    }
    let rt = runtime_dir(&app)?;
    let node = rt.join(NODE_RELATIVE);
    // 入口已核实:package.json bin = {"dsh": "lib/bin.js"}
    let entry = rt.join("app/node_modules/@deepseek-ai/dsh/lib/bin.js");
    let home = dsh_home(&app)?;
    // 工作目录=dsh 的沙箱工作区(sandbox-policy workspaceRoot 取 cwd);默认用户主目录
    let workdir = cwd
        .filter(|s| !s.is_empty())
        .unwrap_or_else(home_dir_fallback);
    let mut command = Command::new(&node);
    command
        .arg(&entry)
        .args(&args)
        .current_dir(&workdir)
        .env("DSH_HOME", &home)
        .env(
            "DSH_PERMISSION_MODE",
            mode.unwrap_or_else(|| "workspace-write".into()),
        )
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut command);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    *state.0.lock().unwrap() = Some(child);
    let app2 = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = app2.emit("dsh-line", format!("[err] {line}"));
        }
    });
    let app3 = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app3.emit("dsh-line", line);
        }
        // stdout EOF:进程退出或被停止,清理句柄避免僵尸
        if let Some(mut c) = app3.state::<RunningChild>().0.lock().unwrap().take() {
            let _ = c.wait();
        }
        let _ = app3.emit("dsh-line", "[exit]".to_string());
    });
    Ok(())
}

#[tauri::command]
fn stop_dsh(state: State<RunningChild>) -> Result<(), String> {
    if let Some(mut c) = state.0.lock().unwrap().take() {
        c.kill().map_err(|e| e.to_string())?;
        let _ = c.wait();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/* ── 用量统计:直接读本机 dsh session 记录(zstd 压缩的 jsonl) ──
数据来源已核实:`request/header` 事件带 config.provider/model,
`assistant/message` 事件带 data.usage 的四个 token 计数。 */
#[derive(serde::Serialize, Default)]
pub struct ModelUsage {
    model: String,
    provider: String,
    input: u64,
    cache_read: u64,
    output: u64,
    reasoning: u64,
    calls: u64,
}

#[derive(serde::Serialize, Default)]
pub struct UsageStats {
    sessions: u64,
    calls: u64,
    input: u64,
    cache_read: u64,
    output: u64,
    reasoning: u64,
    first_at: Option<i64>,
    last_at: Option<i64>,
    models: Vec<ModelUsage>,
    unreadable: u64,
}

fn add_usage(bucket: &mut ModelUsage, usage: &serde_json::Value) {
    let n = |k: &str| usage.get(k).and_then(|v| v.as_u64()).unwrap_or(0);
    bucket.input += n("inputTokens");
    bucket.cache_read += n("cacheReadTokens");
    bucket.output += n("outputTokens");
    bucket.reasoning += n("reasoningTokens");
    bucket.calls += 1;
}

#[tauri::command]
fn usage_stats(app: AppHandle) -> Result<UsageStats, String> {
    Ok(scan_usage(&dsh_home(&app)?.join("sessions")))
}

/// 扫描 sessions 目录做汇总。与 AppHandle 解耦,`examples/usage_dump.rs` 可直接跑它验数。
pub fn scan_usage(root: &std::path::Path) -> UsageStats {
    let mut stats = UsageStats::default();
    let mut by_model: std::collections::BTreeMap<String, ModelUsage> = Default::default();
    // 目录结构:sessions/<cwd-key>/session-<uuid>/session.jsonl.zstd
    let Ok(cwd_dirs) = std::fs::read_dir(root) else {
        return stats; // 还没跑过任务
    };
    for cwd_dir in cwd_dirs.flatten() {
        let Ok(sess_dirs) = std::fs::read_dir(cwd_dir.path()) else {
            continue;
        };
        for sess in sess_dirs.flatten() {
            let file = sess.path().join("session.jsonl.zstd");
            if !file.exists() {
                continue;
            }
            // 会话是多帧追加写的,zstd crate 默认解全部帧
            let decoded = std::fs::read(&file)
                .map_err(|e| e.to_string())
                .and_then(|b| zstd::decode_all(&b[..]).map_err(|e| e.to_string()))
                .and_then(|r| String::from_utf8(r).map_err(|e| e.to_string()));
            let Ok(text) = decoded else {
                stats.unreadable += 1;
                continue;
            };
            stats.sessions += 1;
            let mut model = String::new();
            let mut provider = String::new();
            for line in text.lines() {
                let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
                    continue;
                };
                match v.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                    "session" => {
                        if let Some(ts) = v.get("createdAt").and_then(|t| t.as_i64()) {
                            stats.first_at = Some(stats.first_at.map_or(ts, |f: i64| f.min(ts)));
                            stats.last_at = Some(stats.last_at.map_or(ts, |l: i64| l.max(ts)));
                        }
                    }
                    "request/header" => {
                        if let Some(cfg) = v.pointer("/data/header/config") {
                            if let Some(m) = cfg.get("model").and_then(|m| m.as_str()) {
                                model = m.to_string();
                            }
                            if let Some(p) = cfg.get("provider").and_then(|p| p.as_str()) {
                                provider = p.to_string();
                            }
                        }
                    }
                    "assistant/message" => {
                        if let Some(usage) = v.pointer("/data/usage") {
                            let key = if model.is_empty() {
                                "(未知模型)"
                            } else {
                                &model
                            };
                            let entry =
                                by_model
                                    .entry(key.to_string())
                                    .or_insert_with(|| ModelUsage {
                                        model: key.to_string(),
                                        provider: provider.clone(),
                                        ..Default::default()
                                    });
                            add_usage(entry, usage);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    for m in by_model.into_values() {
        stats.calls += m.calls;
        stats.input += m.input;
        stats.cache_read += m.cache_read;
        stats.output += m.output;
        stats.reasoning += m.reasoning;
        stats.models.push(m);
    }
    stats.models.sort_by(|a, b| b.calls.cmp(&a.calls));
    stats
}

/// 清空本机会话记录(只删 dsh-home/sessions,不碰密钥和 profile)。
/// 前端做二次确认;这里返回删掉的会话数,便于回执。
#[tauri::command]
fn clear_sessions(app: AppHandle) -> Result<u64, String> {
    purge_sessions(&dsh_home(&app)?.join("sessions"))
}

/// 只删 sessions 目录本身并重建空目录;与 AppHandle 解耦以便单测。
pub fn purge_sessions(sessions: &std::path::Path) -> Result<u64, String> {
    let mut n = 0u64;
    if let Ok(cwd_dirs) = std::fs::read_dir(sessions) {
        for cwd_dir in cwd_dirs.flatten() {
            if let Ok(sess_dirs) = std::fs::read_dir(cwd_dir.path()) {
                n += sess_dirs.flatten().count() as u64;
            }
        }
    }
    if sessions.exists() {
        std::fs::remove_dir_all(sessions).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(sessions).map_err(|e| e.to_string())?;
    Ok(n)
}

/// 应用数据目录(密钥、会话记录、profile 都在这儿),给「打开数据目录」用。
#[tauri::command]
fn data_dir(app: AppHandle) -> Result<String, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(RunningChild(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let themes = theme_service(&handle)?;
            if let Err(error) = themes.recover() {
                eprintln!("[studio] 主题恢复警告: {error}");
            }
            app.manage(themes);
            if let Err(e) = start_studio(&handle) {
                eprintln!("[studio] 启动失败: {e}");
                let _ = handle.emit("dsh-line", format!("[fatal] {e}"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_dsh,
            stop_dsh,
            save_model_config,
            load_model_config,
            usage_stats,
            clear_sessions,
            data_dir,
            theme_catalog,
            theme_load,
            theme_import_image,
            theme_save,
            theme_activate,
            theme_delete,
            theme_discard_stage
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // 退出时回收 host 子进程,避免孤儿 node 常驻
            if let tauri::RunEvent::Exit = event {
                if let Some(mut c) = app.state::<RunningChild>().0.lock().unwrap().take() {
                    let _ = c.kill();
                    let _ = c.wait();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 清空只能动 sessions/,同级的密钥和 profile 必须原样留下。
    #[test]
    fn purge_only_touches_sessions() {
        let home = std::env::temp_dir().join("dsh-studio-purge-test");
        let _ = std::fs::remove_dir_all(&home);
        let sessions = home.join("sessions");
        for (cwd, id) in [
            ("--a--", "session-1"),
            ("--a--", "session-2"),
            ("--b--", "session-3"),
        ] {
            let d = sessions.join(cwd).join(id);
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join("session.jsonl.zstd"), b"x").unwrap();
        }
        std::fs::write(home.join("studio-model.json"), b"{}").unwrap();
        std::fs::create_dir_all(home.join("profiles")).unwrap();

        assert_eq!(purge_sessions(&sessions).unwrap(), 3);
        assert!(sessions.exists() && std::fs::read_dir(&sessions).unwrap().next().is_none());
        assert!(home.join("studio-model.json").exists(), "密钥配置被误删");
        assert!(home.join("profiles").exists(), "profile 目录被误删");

        // 已经空了再点一次不能报错
        assert_eq!(purge_sessions(&sessions).unwrap(), 0);
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 升级路径:老清单(缺新插件)必须被合并补齐,且用户后装的条目原样保留。
    #[test]
    fn provision_merges_new_plugins_into_old_manifest() {
        let base = std::env::temp_dir().join("dsh-studio-provision-test");
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        let plugins = base.join("plugins");
        for name in STUDIO_PLUGINS {
            std::fs::create_dir_all(plugins.join(name)).unwrap();
        }
        let profile = home.join("profiles/web");
        std::fs::create_dir_all(&profile).unwrap();
        // 模拟两插件时代的老清单 + 一个用户自装插件
        std::fs::write(
            profile.join("package.json"),
            r#"{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": { "dsh-studio-brand": "link:/old/path", "user-extra": "link:/somewhere" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-studio-brand", "user-extra"] } }
}"#,
        )
        .unwrap();

        provision_web_profile(&home, &plugins).unwrap();

        let raw = std::fs::read_to_string(profile.join("package.json")).unwrap();
        let m: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let bundles: Vec<&str> = m["dsh"]["profile"]["bundles"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        for name in STUDIO_PLUGINS {
            assert!(bundles.contains(&name), "bundles 缺 {name}");
            assert!(
                m["dependencies"][name]
                    .as_str()
                    .unwrap()
                    .starts_with("link:"),
                "deps 缺 {name}"
            );
            assert!(
                profile
                    .join("node_modules")
                    .join(name)
                    .symlink_metadata()
                    .is_ok(),
                "符号链接缺 {name}"
            );
        }
        assert!(bundles.contains(&"user-extra"), "用户自装插件被清掉了");
        assert_eq!(
            m["dependencies"]["user-extra"].as_str().unwrap(),
            "link:/somewhere"
        );
        // link 路径被校准到当前资源目录,不再指向旧位置
        assert!(m["dependencies"]["dsh-studio-brand"]
            .as_str()
            .unwrap()
            .contains("dsh-studio-provision-test"));
        let _ = std::fs::remove_dir_all(&base);
    }

    /// 没有 sessions 目录时统计返回全零而不是崩掉。
    #[test]
    fn scan_missing_dir_is_empty() {
        let st = scan_usage(&std::env::temp_dir().join("dsh-studio-does-not-exist"));
        assert_eq!(st.sessions, 0);
        assert_eq!(st.calls, 0);
        assert!(st.models.is_empty());
    }
}
