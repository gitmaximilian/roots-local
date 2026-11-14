use crate::{
    catalog::Marker,
    import::{chromosome, Build},
};
use noodles::{cram, fasta, sam};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::Path,
    sync::atomic::{AtomicBool, Ordering::Relaxed},
};

#[derive(Clone, Debug, Serialize)]
pub struct Target {
    pub id: String,
    pub coordinate: String,
    pub depth: u64,
    pub bases: [u64; 4],
}
#[derive(Clone, Debug, Serialize)]
pub struct Coverage {
    pub build: Build,
    pub reads: u64,
    pub targets: Vec<Target>,
}

const READ_ERROR: &str =
    "CRAM konnte mit dieser lokalen Referenz nicht vollständig gelesen werden.";

pub fn coverage(
    path: &Path,
    reference: &Path,
    markers: &[Marker],
    cancel: &AtomicBool,
) -> Result<Coverage, String> {
    use fasta::repository::adapters::IndexedReader;
    let reference = fasta::io::indexed_reader::Builder::default()
        .build_from_path(reference)
        .map_err(|_| "Eine lokale FASTA-Datei mit zugehörigem .fai-Index ist erforderlich.")?;
    let mut reader = cram::io::reader::Builder::default()
        .set_reference_sequence_repository(fasta::Repository::new(IndexedReader::new(reference)))
        .build_from_path(path)
        .map_err(|_| READ_ERROR)?;
    let header = reader.read_header().map_err(|_| READ_ERROR)?;
    let chr1: Vec<_> = header
        .reference_sequences()
        .iter()
        .filter(|(name, _)| matches!(name.as_slice(), b"1" | b"chr1"))
        .map(|(_, data)| data.length().get())
        .collect();
    let chr2: Vec<_> = header
        .reference_sequences()
        .iter()
        .filter(|(name, _)| matches!(name.as_slice(), b"2" | b"chr2"))
        .map(|(_, data)| data.length().get())
        .collect();
    let build = match (chr1.as_slice(), chr2.as_slice()) {
        ([249250621], [243199373]) => Build::Grch37,
        ([248956422], [242193529]) => Build::Grch38,
        _ => return Err(
            "Die CRAM-Referenz entspricht anhand der Chromosomenlängen keinem unterstützten Build."
                .into(),
        ),
    };
    let mut sites = Vec::new();
    for marker in markers {
        let index = header
            .reference_sequences()
            .keys()
            .enumerate()
            .find(|(_, key)| {
                std::str::from_utf8(key.as_ref())
                    .ok()
                    .and_then(chromosome)
                    .as_ref()
                    == Some(&marker.2)
            })
            .map(|(index, _)| index);
        if let Some(index) = index {
            let pos = if build == Build::Grch37 {
                marker.3
            } else {
                marker.4
            } as usize;
            sites.push((
                index,
                pos,
                Target {
                    id: marker.0.clone(),
                    coordinate: format!("{}:{pos}", marker.2),
                    depth: 0,
                    bases: [0; 4],
                },
            ));
        }
    }
    let reads = count(&mut reader, &header, &mut sites, cancel)?;
    Ok(Coverage {
        build,
        reads,
        targets: sites.into_iter().map(|(_, _, t)| t).collect(),
    })
}

fn count<R: std::io::Read>(
    reader: &mut cram::io::Reader<R>,
    header: &sam::Header,
    sites: &mut [(usize, usize, Target)],
    cancel: &AtomicBool,
) -> Result<u64, String> {
    let mut by_reference: HashMap<usize, Vec<(usize, usize)>> = HashMap::new();
    for (index, (reference, position, _)) in sites.iter().enumerate() {
        by_reference
            .entry(*reference)
            .or_default()
            .push((*position, index));
    }
    for entries in by_reference.values_mut() {
        entries.sort_unstable();
    }
    let mut reads = 0;
    for item in reader.records(header) {
        if cancel.load(Relaxed) {
            return Err("CRAM-Auswertung abgebrochen.".into());
        }
        let read = item.map_err(|_| READ_ERROR)?;
        reads += 1;
        let flags = read.flags();
        if flags.is_unmapped()
            || flags.is_secondary()
            || flags.is_supplementary()
            || flags.is_duplicate()
            || flags.is_qc_fail()
        {
            continue;
        }
        if !read.mapping_quality().is_some_and(|q| q.get() >= 30) {
            continue;
        }
        let Some(reference) = read.reference_sequence_id() else {
            continue;
        };
        let Some(targets) = by_reference.get(&reference) else {
            continue;
        };
        let Some(start) = read.alignment_start() else {
            continue;
        };
        let mut genome = start.get();
        let mut offset = 0;
        let sequence = read.sequence();
        let quality: &[u8] = read.quality_scores().as_ref();
        for op in read.cigar().as_ref() {
            let reference = op.kind().consumes_reference();
            let query = op.kind().consumes_read();
            if reference && query {
                let before = targets.partition_point(|(position, _)| *position < genome);
                for &(position, index) in targets[before..]
                    .iter()
                    .take_while(|(position, _)| *position < genome + op.len())
                {
                    let base = offset + position - genome;
                    if quality.get(base).is_some_and(|q| *q != 255 && *q >= 20) {
                        if let Some(index_base) = sequence.get(base).and_then(|base| {
                            b"ACGT".iter().position(|b| *b == base.to_ascii_uppercase())
                        }) {
                            sites[index].2.depth += 1;
                            sites[index].2.bases[index_base] += 1;
                        }
                    }
                }
            }
            if reference {
                genome = genome.checked_add(op.len()).ok_or(READ_ERROR)?;
            }
            if query {
                offset = offset.checked_add(op.len()).ok_or(READ_ERROR)?;
            }
        }
    }
    Ok(reads)
}

#[cfg(test)]
mod tests {
    use super::*;
    use noodles::{
        core::Position,
        sam::alignment::{
            io::Write,
            record::{
                cigar::{op::Kind, Op},
                Flags, MappingQuality,
            },
            record_buf::Sequence,
            RecordBuf,
        },
    };
    use std::io::Cursor;

    #[test]
    fn measures_only_high_quality_bases_from_local_cram() {
        let references = vec![fasta::Record::new(
            fasta::record::Definition::new("chr1", None),
            fasta::record::Sequence::from(b"ACCTAGGA".to_vec()),
        )];
        let header =
            sam::Header::builder()
                .add_reference_sequence(
                    "chr1",
                    sam::header::record::value::Map::<
                        sam::header::record::value::map::ReferenceSequence,
                    >::new(8.try_into().unwrap()),
                )
                .build();
        let mut buffer = Vec::new();
        let repo = fasta::Repository::new(references.clone());
        let mut writer = cram::io::writer::Builder::default()
            .set_reference_sequence_repository(repo)
            .build_from_writer(&mut buffer);
        writer.write_header(&header).unwrap();
        for (bases, flag, quality) in [
            (b"ACCTAGGA", Flags::empty(), 40),
            (b"AGCTAGGA", Flags::empty(), 40),
            (b"AGCTAGGA", Flags::DUPLICATE, 40),
            (b"ATCTAGGA", Flags::empty(), 10),
        ] {
            let read = RecordBuf::builder()
                .set_flags(flag)
                .set_reference_sequence_id(0)
                .set_alignment_start(Position::MIN)
                .set_mapping_quality(MappingQuality::new(60).unwrap())
                .set_cigar([Op::new(Kind::Match, 8)].into_iter().collect())
                .set_sequence(Sequence::from(bases.as_slice()))
                .set_quality_scores([quality; 8].into_iter().collect())
                .build();
            writer.write_alignment_record(&header, &read).unwrap();
        }
        writer.try_finish(&header).unwrap();
        drop(writer);
        let mut reader = cram::io::reader::Builder::default()
            .set_reference_sequence_repository(fasta::Repository::new(references))
            .build_from_reader(Cursor::new(buffer));
        let header = reader.read_header().unwrap();
        let mut sites = [(
            0,
            2,
            Target {
                id: "synthetic".into(),
                coordinate: "1:2".into(),
                depth: 0,
                bases: [0; 4],
            },
        )];
        assert_eq!(
            count(&mut reader, &header, &mut sites, &AtomicBool::new(false)).unwrap(),
            4
        );
        assert_eq!(sites[0].2.depth, 2);
        assert_eq!(sites[0].2.bases, [0, 1, 1, 0]);
    }
}
