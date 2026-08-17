use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

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
    let home = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dsh-home");
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    Ok(home)
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
            let api = if kind == "anthropic" { "anthropic-messages" } else { "openai-completions" };
            format!(
                "{persona_patch}- id: llm-pi-ai\n  config:\n    providers:\n      studio:\n        displayName: 我的模型\n        apiKeyEnv: STUDIO_API_KEY\n        api: {api}\n        baseURL: {base_url}\n        models:\n          - id: {model}\n            contextWindow: 131072\n            maxTokens: 8192\n- id: agent-default-model\n  config:\n    provider: studio\n    model: {model}\n"
            )
        }
    };
    std::fs::write(profile.join("cordis.patch.yml"), patch).map_err(|e| e.to_string())?;

    let cfg = ModelConfig { kind, base_url, model, api_key_set: true };
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
    let res = app.path().resource_dir().map_err(|e| e.to_string())?;
    let node = res.join("runtime/node/bin/node");
    let dsh = res.join("runtime/app/node_modules/@deepseek-ai/dsh");
    // 入口已核实:package.json bin = {"dsh": "lib/bin.js"}
    let entry = dsh.join("lib/bin.js");
    let home = dsh_home(&app)?;
    // 工作目录=dsh 的沙箱工作区(sandbox-policy workspaceRoot 取 cwd);默认用户主目录
    let workdir = cwd
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/".into()));
    let mut child = Command::new(&node)
        .arg(&entry)
        .args(&args)
        .current_dir(&workdir)
        .env("DSH_HOME", &home)
        .env(
            "DSH_PERMISSION_MODE",
            mode.unwrap_or_else(|| "workspace-write".into()),
        )
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
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
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(RunningChild(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            run_dsh,
            stop_dsh,
            save_model_config,
            load_model_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
