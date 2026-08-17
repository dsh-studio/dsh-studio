use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
fn run_dsh(app: AppHandle, args: Vec<String>) -> Result<(), String> {
    let res = app.path().resource_dir().map_err(|e| e.to_string())?;
    let node = res.join("runtime/node/bin/node");
    let dsh = res.join("runtime/app/node_modules/@deepseek-ai/dsh");
    // 入口已核实：package.json bin = {"dsh": "lib/bin.js"}
    let entry = dsh.join("lib/bin.js");
    let home = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dsh-home");
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let mut child = Command::new(&node)
        .arg(&entry)
        .args(&args)
        .env("DSH_HOME", &home)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
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
        let _ = app3.emit("dsh-line", "[exit]".to_string());
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_dsh])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
