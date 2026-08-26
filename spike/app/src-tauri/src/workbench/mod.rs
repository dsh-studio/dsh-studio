use std::fmt::{Display, Formatter};

pub mod artifact;
pub mod browser;
pub mod commands;
pub mod composer;
pub mod market;
pub mod model;
pub mod service;
pub mod state;
pub mod tui;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkbenchError {
    code: &'static str,
    message: String,
}

impl WorkbenchError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> &'static str {
        self.code
    }
}

impl Display for WorkbenchError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for WorkbenchError {}

#[cfg(test)]
mod tests;
