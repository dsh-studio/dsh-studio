//! 用真实的 dsh-home 验证用量扫描逻辑:
//!   cargo run --example usage_dump -- "<app-data-dir>/dsh-home/sessions"
fn main() {
    let arg = std::env::args()
        .nth(1)
        .expect("用法: usage_dump <sessions 目录>");
    let stats = app_lib::scan_usage(std::path::Path::new(&arg));
    println!("{}", serde_json::to_string_pretty(&stats).unwrap());
}
