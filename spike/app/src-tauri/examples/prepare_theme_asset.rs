use std::path::{Path, PathBuf};

use app_lib::theme::image::{normalize_image, sha256_file};

fn main() -> Result<(), String> {
    let input = argument("--input")?;
    let output = argument("--output")?;
    let thumbnail = argument("--thumbnail")?;
    let output = PathBuf::from(output);
    let thumbnail = PathBuf::from(thumbnail);
    let output_dir = output
        .parent()
        .ok_or_else(|| "--output 必须包含目标目录".to_string())?;

    if output.file_name().and_then(|name| name.to_str()) != Some("background.webp")
        || thumbnail.file_name().and_then(|name| name.to_str()) != Some("thumbnail.webp")
        || thumbnail.parent() != Some(output_dir)
    {
        return Err("输出必须是同一预设目录下的 background.webp 与 thumbnail.webp".into());
    }

    std::fs::create_dir_all(output_dir).map_err(|_| "无法创建预设目录".to_string())?;
    ensure_preset_target(output_dir)?;
    let normalized =
        normalize_image(Path::new(&input), output_dir).map_err(|error| error.to_string())?;
    println!(
        "background_sha256={}",
        sha256_file(&normalized.background).map_err(|error| error.to_string())?
    );
    println!(
        "thumbnail_sha256={}",
        sha256_file(&normalized.thumbnail).map_err(|error| error.to_string())?
    );
    println!("accent={}", normalized.accent);
    println!("dimensions={}x{}", normalized.width, normalized.height);
    Ok(())
}

fn argument(name: &str) -> Result<String, String> {
    let mut args = std::env::args().skip(1);
    while let Some(argument) = args.next() {
        if argument == name {
            return args.next().ok_or_else(|| format!("{name} 缺少参数值"));
        }
    }
    Err(format!("缺少 {name}"))
}

fn ensure_preset_target(output_dir: &Path) -> Result<(), String> {
    let allowed = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../themes/presets");
    std::fs::create_dir_all(&allowed).map_err(|_| "无法创建主题资源目录".to_string())?;
    let allowed = allowed
        .canonicalize()
        .map_err(|_| "无法验证主题资源目录".to_string())?;
    let output = output_dir
        .canonicalize()
        .map_err(|_| "无法验证预设输出目录".to_string())?;
    if output.parent() != Some(allowed.as_path()) {
        return Err("拒绝写入 spike/themes/presets 之外的目录".into());
    }
    Ok(())
}
