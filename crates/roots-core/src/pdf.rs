//! Renders the Typst report templates in-process.
//!
//! The same compiler (Typst 0.15.1) and the same bundled fonts are used on every
//! platform, including WebAssembly in the browser. Nothing is read from disk or
//! fetched at runtime: the template, the report data, and the fonts are the only
//! inputs the compiler can see.

use std::sync::OnceLock;
use typst::{
    diag::{FileError, FileResult},
    foundations::{Bytes, Datetime, Duration},
    syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot},
    text::{Font, FontBook},
    utils::LazyHash,
    Library, LibraryExt, World,
};
use typst_layout::PagedDocument;

struct Fonts {
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
}

fn fonts() -> &'static Fonts {
    static FONTS: OnceLock<Fonts> = OnceLock::new();
    FONTS.get_or_init(|| {
        let fonts: Vec<Font> = typst_assets::fonts()
            .flat_map(|data| Font::iter(Bytes::new(data)))
            .collect();
        Fonts {
            book: LazyHash::new(FontBook::from_fonts(&fonts)),
            fonts,
        }
    })
}

fn library() -> &'static LazyHash<Library> {
    static LIBRARY: OnceLock<LazyHash<Library>> = OnceLock::new();
    LIBRARY.get_or_init(|| LazyHash::new(Library::default()))
}

fn file_id(name: &str) -> FileId {
    RootedPath::new(
        VirtualRoot::Project,
        VirtualPath::new(name).expect("valid built-in path"),
    )
    .intern()
}

struct ReportWorld {
    main: Source,
    data: Bytes,
    data_id: FileId,
}

impl World for ReportWorld {
    fn library(&self) -> &LazyHash<Library> {
        library()
    }
    fn book(&self) -> &LazyHash<FontBook> {
        &fonts().book
    }
    fn main(&self) -> FileId {
        self.main.id()
    }
    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main.id() {
            Ok(self.main.clone())
        } else {
            Err(FileError::AccessDenied)
        }
    }
    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.data_id {
            Ok(self.data.clone())
        } else if id == self.main.id() {
            Ok(Bytes::from_string(self.main.clone()))
        } else {
            Err(FileError::AccessDenied)
        }
    }
    fn font(&self, index: usize) -> Option<Font> {
        fonts().fonts.get(index).cloned()
    }
    fn today(&self, _: Option<Duration>) -> Option<Datetime> {
        None
    }
}

/// Compiles a Typst template that reads its data from `report.json`.
pub fn compile(template: &str, data: Vec<u8>) -> Result<Vec<u8>, String> {
    let world = ReportWorld {
        main: Source::new(file_id("/report.typ"), template.to_owned()),
        data: Bytes::new(data),
        data_id: file_id("/report.json"),
    };
    let document: PagedDocument = typst::compile(&world)
        .output
        .map_err(|_| "Der Report konnte nicht gerendert werden.")?;
    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|_| "Der Report konnte nicht gerendert werden.".into())
}
