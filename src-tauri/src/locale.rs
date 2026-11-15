use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::OnceLock};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    En,
    De,
}

impl Language {
    pub fn select<'a>(self, en: &'a str, de: &'a str) -> &'a str {
        match self {
            Self::En => en,
            Self::De => de,
        }
    }
}

pub fn english(message: &str) -> &str {
    static STRINGS: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    STRINGS
        .get_or_init(|| {
            serde_json::from_str(include_str!("../../catalog/result-strings.json"))
                .expect("valid built-in result translations")
        })
        .get(message)
        .copied()
        .unwrap_or(message)
}

pub fn translate(message: &mut String) {
    if english(message) != message {
        *message = english(message).to_owned();
    } else if let Some(suffix) = message.strip_prefix("Publikation · ") {
        *message = format!("Publication · {suffix}");
    }
}

pub fn english_if(language: Language, message: &str) -> String {
    match language {
        Language::En => english(message).to_owned(),
        Language::De => message.to_owned(),
    }
}

impl Language {
    pub fn select2<T>(self, en: T, de: T) -> T {
        match self {
            Self::En => en,
            Self::De => de,
        }
    }
}
