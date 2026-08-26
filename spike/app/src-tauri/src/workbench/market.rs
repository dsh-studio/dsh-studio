use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;

use super::WorkbenchError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketCatalogPage {
    pub total: usize,
    pub matched: usize,
    pub query: String,
    pub categories: serde_json::Value,
    pub plugins: Vec<MarketPlugin>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPlugin {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub npm: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<BTreeMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stars: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloads: Option<u64>,
}

pub fn search_market_catalog(
    path: &Path,
    query: &str,
    limit: usize,
) -> Result<MarketCatalogPage, WorkbenchError> {
    let query = query.trim().chars().take(100).collect::<String>();
    let needle = query.to_lowercase();
    let limit = limit.clamp(1, 50);
    let raw = std::fs::read_to_string(path)
        .map_err(|_| WorkbenchError::new("market_catalog_missing", "Market 目录文件缺失"))?;
    let root: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|_| WorkbenchError::new("market_catalog_invalid", "Market 目录无法解析"))?;
    let all = root
        .get("plugins")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| WorkbenchError::new("market_catalog_invalid", "Market 目录结构无效"))?;
    let normalized = all
        .iter()
        .map(normalize_plugin)
        .collect::<Result<Vec<_>, _>>()?;
    let matches = normalized.iter().filter(|plugin| {
        if needle.is_empty() {
            return true;
        }
        searchable_text(plugin).to_lowercase().contains(&needle)
    });
    let mut matched = 0usize;
    let mut plugins = Vec::new();
    for plugin in matches {
        matched += 1;
        if plugins.len() < limit {
            plugins.push(plugin.clone());
        }
    }
    Ok(MarketCatalogPage {
        total: normalized.len(),
        matched,
        query,
        categories: root
            .get("categories")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({})),
        plugins,
    })
}

fn normalize_plugin(plugin: &serde_json::Value) -> Result<MarketPlugin, WorkbenchError> {
    let name = plugin
        .get("name")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| WorkbenchError::new("market_catalog_invalid", "Market 插件条目缺少名称"))?;
    let string = |key: &str| {
        plugin
            .get(key)
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
    };
    let category = plugin
        .get("category")
        .and_then(|value| (value.is_string() || value.is_array()).then(|| value.clone()));
    let description = plugin.get("description").and_then(|value| {
        value.as_object().map(|entries| {
            entries
                .iter()
                .filter_map(|(language, text)| {
                    text.as_str()
                        .map(|text| (language.clone(), text.to_string()))
                })
                .collect::<BTreeMap<_, _>>()
        })
    });
    Ok(MarketPlugin {
        name: name.to_string(),
        owner: string("owner"),
        url: string("url"),
        npm: string("npm"),
        category,
        description,
        stars: plugin.get("stars").and_then(serde_json::Value::as_u64),
        downloads: plugin.get("downloads").and_then(serde_json::Value::as_u64),
    })
}

fn searchable_text(plugin: &MarketPlugin) -> String {
    let mut values = Vec::new();
    values.push(plugin.name.as_str());
    for value in [
        plugin.owner.as_deref(),
        plugin.npm.as_deref(),
        plugin.url.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        values.push(value);
    }
    if let Some(description) = &plugin.description {
        values.extend(description.values().map(String::as_str));
    }
    values.join(" ")
}
