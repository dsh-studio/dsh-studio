use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThemeError {
    code: &'static str,
    message: String,
}

impl ThemeError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> &'static str {
        self.code
    }

    pub fn invalid(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(code, message)
    }

    pub fn io(operation: &'static str) -> Self {
        let message = match operation {
            "read" => "无法读取主题",
            "save" => "无法保存主题",
            "delete" => "无法删除主题",
            "activate" => "无法切换主题",
            "import" => "无法导入图片",
            _ => "主题操作失败",
        };
        Self::new("io_failed", message)
    }
}

impl Display for ThemeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for ThemeError {}

pub type ThemeResult<T> = Result<T, ThemeError>;
