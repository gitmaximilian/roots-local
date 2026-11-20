//! Compiles the Roots Local Typst templates to PDF in-process.
//!
//! The same compiler (Typst 0.15.1) and the same font files are used in tests
//! and in the browser. Nothing is read from disk or fetched by the compiler: the
//! template, the report data, and the fonts handed in are its only inputs.

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

/// The font files the templates use, copied unchanged from `typst-assets` 0.15.1
/// into `fonts/`. The web app serves the same files from its own origin.
///
/// The templates set Libertinus Serif for text and DejaVu Sans Mono for code.
pub const FONT_FILES: &[&str] = &[
    "LibertinusSerif-Regular.otf",
    "LibertinusSerif-Bold.otf",
    "LibertinusSerif-Italic.otf",
    "LibertinusSerif-BoldItalic.otf",
    "LibertinusSerif-Semibold.otf",
    "LibertinusSerif-SemiboldItalic.otf",
    "DejaVuSansMono.ttf",
    "DejaVuSansMono-Bold.ttf",
    "DejaVuSansMono-Oblique.ttf",
    "DejaVuSansMono-BoldOblique.ttf",
];

const REPORT: &str = include_str!("../../../report/report.typ");
const PASS: &str = include_str!("../../../report/pass.typ");

/// Fonts loaded once and shared by every compilation.
pub struct Fonts {
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
}

impl Fonts {
    /// Parses font files. Invalid data is skipped.
    pub fn new(files: impl IntoIterator<Item = Vec<u8>>) -> Self {
        let fonts: Vec<Font> = files
            .into_iter()
            .flat_map(|data| Font::iter(Bytes::new(data)))
            .collect();
        Self {
            book: LazyHash::new(FontBook::from_fonts(&fonts)),
            fonts,
        }
    }

    /// The fonts in `fonts/` listed in [`FONT_FILES`], embedded at build time.
    #[cfg(feature = "bundled-fonts")]
    pub fn bundled() -> &'static Self {
        macro_rules! embed {
            ($($name:literal),*) => {
                [$(include_bytes!(concat!("../../../fonts/", $name)).as_slice()),*]
            };
        }
        static FONTS: OnceLock<Fonts> = OnceLock::new();
        FONTS.get_or_init(|| {
            Self::new(
                embed!(
                    "LibertinusSerif-Regular.otf",
                    "LibertinusSerif-Bold.otf",
                    "LibertinusSerif-Italic.otf",
                    "LibertinusSerif-BoldItalic.otf",
                    "LibertinusSerif-Semibold.otf",
                    "LibertinusSerif-SemiboldItalic.otf",
                    "DejaVuSansMono.ttf",
                    "DejaVuSansMono-Bold.ttf",
                    "DejaVuSansMono-Oblique.ttf",
                    "DejaVuSansMono-BoldOblique.ttf"
                )
                .map(<[u8]>::to_vec),
            )
        })
    }

    pub fn len(&self) -> usize {
        self.fonts.len()
    }

    pub fn is_empty(&self) -> bool {
        self.fonts.is_empty()
    }
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

struct ReportWorld<'a> {
    main: Source,
    data: Bytes,
    data_id: FileId,
    fonts: &'a Fonts,
}

impl World for ReportWorld<'_> {
    fn library(&self) -> &LazyHash<Library> {
        library()
    }
    fn book(&self) -> &LazyHash<FontBook> {
        &self.fonts.book
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
        self.fonts.fonts.get(index).cloned()
    }
    fn today(&self, _: Option<Duration>) -> Option<Datetime> {
        None
    }
}

/// Compiles the report (or the medicine pass when `pass` is set) from the
/// prepared `report.json` data.
pub fn render(pass: bool, data: Vec<u8>, fonts: &Fonts) -> Result<Vec<u8>, String> {
    let template = if pass { PASS } else { REPORT };
    let world = ReportWorld {
        main: Source::new(file_id("/report.typ"), template.to_owned()),
        data: Bytes::new(data),
        data_id: file_id("/report.json"),
        fonts,
    };
    let document: PagedDocument = typst::compile(&world)
        .output
        .map_err(|_| "Der Report konnte nicht gerendert werden.")?;
    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|_| "Der Report konnte nicht gerendert werden.".into())
}
