use crate::import::{self, Variant};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub type Conflicts = HashMap<String, HashSet<u32>>;
const PAGE_SIZE: usize = 50;

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Quality {
    Present,
    NoCall,
    Conflict,
}

#[derive(Serialize)]
pub struct Row {
    #[serde(flatten)]
    variant: Variant,
    quality: Quality,
}

#[derive(Serialize)]
pub struct Page {
    total: usize,
    offset: usize,
    page_size: usize,
    rows: Vec<Row>,
}

enum Query<'a> {
    All,
    Marker(&'a str),
    Region {
        chromosome: String,
        start: u32,
        end: u32,
    },
}

impl<'a> Query<'a> {
    fn parse(input: &'a str) -> Result<Self, &'static str> {
        const INVALID: &str =
            "Ungültiger Bereich. Verwende z. B. 2:136608646 oder chr2:136600000-136650000.";
        let input = input.trim();
        if input.is_empty() {
            return Ok(Self::All);
        }
        let Some((chr, range)) = input.split_once(':') else {
            return Ok(Self::Marker(input));
        };
        let position = |text: &str| text.trim().parse::<u32>().ok().filter(|value| *value > 0);
        let (start, end) = range.split_once('-').unwrap_or((range, range));
        let chromosome = import::chromosome(chr).ok_or(INVALID)?;
        let start = position(start).ok_or(INVALID)?;
        let end = position(end).filter(|end| *end >= start).ok_or(INVALID)?;
        Ok(Self::Region {
            chromosome,
            start,
            end,
        })
    }

    fn matches(&self, variant: &Variant) -> bool {
        match self {
            Self::All => true,
            Self::Marker(marker) => variant
                .id
                .as_bytes()
                .windows(marker.len())
                .any(|part| part.eq_ignore_ascii_case(marker.as_bytes())),
            Self::Region {
                chromosome,
                start,
                end,
            } => variant.chromosome == *chromosome && (*start..=*end).contains(&variant.position),
        }
    }
}

pub fn page(
    variants: &[Variant],
    conflicts: &Conflicts,
    query: &str,
    chromosome: Option<&str>,
    quality: Option<Quality>,
    offset: usize,
) -> Result<Page, &'static str> {
    let query = Query::parse(query)?;
    let quality_of = |variant: &Variant| {
        if conflicts
            .get(&variant.chromosome)
            .is_some_and(|positions| positions.contains(&variant.position))
        {
            Quality::Conflict
        } else if variant.alleles.is_none() {
            Quality::NoCall
        } else {
            Quality::Present
        }
    };
    let matching = variants
        .iter()
        .filter(|variant| {
            chromosome.is_none_or(|chr| variant.chromosome == chr) && query.matches(variant)
        })
        .filter(|variant| quality.is_none_or(|quality| quality_of(variant) == quality));

    let unfiltered = chromosome.is_none() && quality.is_none() && matches!(query, Query::All);
    let total = if unfiltered {
        variants.len()
    } else {
        matching.clone().count()
    };
    let offset =
        (offset / PAGE_SIZE * PAGE_SIZE).min(total.saturating_sub(1) / PAGE_SIZE * PAGE_SIZE);
    let as_row = |variant: &Variant| Row {
        quality: quality_of(variant),
        variant: variant.clone(),
    };
    let rows = if unfiltered {
        variants[offset..]
            .iter()
            .take(PAGE_SIZE)
            .map(as_row)
            .collect()
    } else {
        matching.skip(offset).take(PAGE_SIZE).map(as_row).collect()
    };
    Ok(Page {
        total,
        offset,
        page_size: PAGE_SIZE,
        rows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn lookup_keeps_raw_rows_and_distinguishes_call_quality() {
        let input = b"RSID,CHROMOSOME,POSITION,RESULT
rs101,2,100,AG
rs101,2,100,GG
rs102,2,101,--
rs103,2,1000,AA
rs104,MT,100,CC
rs104,MT,100,CC";
        let data = import::parse(&input[..], &AtomicBool::new(false)).unwrap();
        let (summary, conflicts) = analysis::summary_with_conflicts(&data);
        assert_eq!((summary.duplicates, summary.conflicts), (2, 1));
        let lookup = |query, chr, quality| page(&data.rows, &conflicts, query, chr, quality, 0);
        let result = lookup(" chr2:100 ", None, None).unwrap();
        assert_eq!(result.total, 2);
        assert!(result
            .rows
            .into_iter()
            .all(|row| row.quality == Quality::Conflict));
        assert_eq!(lookup("2:100-101", Some("2"), None).unwrap().total, 3);
        assert_eq!(lookup("2:100-101", Some("MT"), None).unwrap().total, 0);
        assert_eq!(
            lookup("chrM:100", None, Some(Quality::Present))
                .unwrap()
                .total,
            2
        );
        assert_eq!(
            lookup("RS10", None, Some(Quality::NoCall)).unwrap().rows[0]
                .variant
                .id,
            "rs102"
        );
        assert_eq!(lookup("", None, Some(Quality::Conflict)).unwrap().total, 2);
        assert!(lookup("2:101-100", None, None).is_err());
        assert!(lookup("chr2:0", None, None).is_err());
    }

    #[test]
    fn pages_are_bounded_and_keep_file_order() {
        let data = (1..=105)
            .rev()
            .map(|position| Variant {
                id: format!("rs{position}"),
                chromosome: "2".into(),
                position,
                alleles: Some("AA".into()),
            })
            .collect::<Vec<_>>();
        for query in ["", "rs", "chr2:1-105"] {
            let last = page(&data, &Conflicts::new(), query, None, None, usize::MAX).unwrap();
            assert_eq!((last.offset, last.total, last.rows.len()), (100, 105, 5));
            assert_eq!(last.rows[0].variant.position, 5);
            assert_eq!(last.rows[4].variant.position, 1);
        }
    }
}
