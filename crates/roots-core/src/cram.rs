use crate::{
    catalog::Marker,
    import::{chromosome, Build},
};
use md5::{Digest, Md5};
use noodles::{cram, fasta, sam};
use sam::header::record::value::map::reference_sequence::md5_checksum::Md5Checksum;
use serde::Serialize;
use std::{
    collections::HashMap,
    io,
    sync::{
        atomic::{AtomicBool, Ordering::Relaxed},
        Arc, OnceLock,
    },
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

type ReferenceDictionary = HashMap<Vec<u8>, (usize, Option<Vec<u8>>)>;

struct CheckedReference<A> {
    source: A,
    dictionary: Arc<OnceLock<ReferenceDictionary>>,
}

impl<A: fasta::repository::Adapter> fasta::repository::Adapter for CheckedReference<A> {
    fn get(&mut self, name: &[u8]) -> Option<io::Result<fasta::Record>> {
        let record = self.source.get(name)?;
        Some(record.and_then(|record| {
            let invalid = || io::Error::new(io::ErrorKind::InvalidData, "CRAM reference mismatch");
            let (length, checksum) = self
                .dictionary
                .get()
                .and_then(|dict| dict.get(name))
                .ok_or_else(invalid)?;
            let sequence = record.sequence().as_ref();
            if sequence.len() != *length {
                return Err(invalid());
            }
            if let Some(expected) = checksum {
                let mut digest = Md5::new();
                let mut buffer = [0u8; 8192];
                for chunk in sequence.chunks(buffer.len()) {
                    buffer[..chunk.len()].copy_from_slice(chunk);
                    buffer[..chunk.len()].make_ascii_uppercase();
                    digest.update(&buffer[..chunk.len()]);
                }
                if !Md5Checksum::from(<[u8; 16]>::from(digest.finalize()))
                    .to_string()
                    .as_bytes()
                    .eq_ignore_ascii_case(expected)
                {
                    return Err(invalid());
                }
            }
            Ok(record)
        }))
    }
}

/// Measures catalog marker coverage in a CRAM file.
///
/// `reference` is an uncompressed FASTA and `index` its `.fai` index. Both are
/// read with random access, so only the requested regions are loaded.
pub fn coverage<R, F>(
    cram: R,
    reference: F,
    index: impl io::Read,
    markers: &[Marker],
    cancel: &AtomicBool,
) -> Result<Coverage, String>
where
    R: io::Read,
    F: io::BufRead + io::Seek + Send + Sync + 'static,
{
    use fasta::repository::adapters::IndexedReader;
    const REFERENCE_ERROR: &str =
        "Eine lokale FASTA-Datei mit zugehörigem .fai-Index ist erforderlich.";
    let index = fasta::fai::io::Reader::new(io::BufReader::new(index))
        .read_index()
        .map_err(|_| REFERENCE_ERROR)?;
    let reference = fasta::io::IndexedReader::new(reference, index);
    let dictionary = Arc::new(OnceLock::new());
    let mut reader = cram::io::reader::Builder::default()
        .set_reference_sequence_repository(fasta::Repository::new(CheckedReference {
            source: IndexedReader::new(reference),
            dictionary: dictionary.clone(),
        }))
        .build_from_reader(cram);
    let header = reader.read_header().map_err(|_| READ_ERROR)?;
    use sam::header::record::value::map::reference_sequence::tag::MD5_CHECKSUM;
    dictionary
        .set(
            header
                .reference_sequences()
                .iter()
                .map(|(name, entry)| {
                    let checksum = entry
                        .other_fields()
                        .get(&MD5_CHECKSUM)
                        .map(|value| value.to_vec());
                    (name.to_vec(), (entry.length().get(), checksum))
                })
                .collect(),
        )
        .map_err(|_| READ_ERROR)?;
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
            if pos == 0 {
                continue;
            }
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
        let mut offset = 0usize;
        let sequence = read.sequence();
        let quality: &[u8] = read.quality_scores().as_ref();
        for op in read.cigar().as_ref() {
            let reference = op.kind().consumes_reference();
            let query = op.kind().consumes_read();
            let end = if reference {
                genome.checked_add(op.len()).ok_or(READ_ERROR)?
            } else {
                genome
            };
            if reference && query {
                let before = targets.partition_point(|(position, _)| *position < genome);
                for &(position, index) in targets[before..]
                    .iter()
                    .take_while(|(position, _)| *position < end)
                {
                    let base = offset.checked_add(position - genome).ok_or(READ_ERROR)?;
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
            genome = end;
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
    use std::fs;

    #[test]
    fn rejects_mismatched_reference_checksum() {
        use fasta::repository::Adapter;
        let name = b"chr1";
        let references = vec![fasta::Record::new(
            fasta::record::Definition::new("chr1", None),
            fasta::record::Sequence::from(b"acgt".to_vec()),
        )];
        let reference = |checksum: &str| CheckedReference {
            source: references.clone(),
            dictionary: Arc::new(OnceLock::from(HashMap::from([(
                name.to_vec(),
                (4, Some(checksum.as_bytes().to_vec())),
            )]))),
        };
        assert!(reference("f1f8f4bf413b16ad135722aa4591043e")
            .get(name)
            .unwrap()
            .is_ok());
        assert!(reference("00000000000000000000000000000000")
            .get(name)
            .unwrap()
            .is_err());
    }

    #[test]
    fn measures_only_high_quality_bases_from_local_cram() {
        let directory = tempfile::tempdir().unwrap();
        let cram = directory.path().join("synthetic.cram");
        let fasta = directory.path().join("reference.fa");
        fs::write(&fasta, ">chr22\nACCTAGGA\n").unwrap();
        fs::write(
            directory.path().join("reference.fa.fai"),
            "chr22\t8\t7\t8\t9\n",
        )
        .unwrap();
        let references = vec![fasta::Record::new(
            fasta::record::Definition::new("chr22", None),
            fasta::record::Sequence::from(b"ACCTAGGA".to_vec()),
        )];
        let reference_entry = |length: usize| {
            use sam::header::record::value::map::reference_sequence::tag::MD5_CHECKSUM;
            use sam::header::record::value::{map::ReferenceSequence, Map};
            let mut entry = Map::<ReferenceSequence>::new(length.try_into().unwrap());
            // No alignments use these dictionary entries. Their lengths select GRCh37.
            entry
                .other_fields_mut()
                .insert(MD5_CHECKSUM, "00000000000000000000000000000000".into());
            entry
        };
        let header =
            sam::Header::builder()
                .add_reference_sequence("chr1", reference_entry(249250621))
                .add_reference_sequence("chr2", reference_entry(243199373))
                .add_reference_sequence(
                    "chr22",
                    sam::header::record::value::Map::<
                        sam::header::record::value::map::ReferenceSequence,
                    >::new(8.try_into().unwrap()),
                )
                .build();
        let mut buffer = Vec::new();
        let repo = fasta::Repository::new(references);
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
                .set_reference_sequence_id(2)
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
        fs::write(&cram, buffer).unwrap();
        let markers = [Marker(
            "synthetic".into(),
            "TEST".into(),
            "22".into(),
            2,
            0,
            "CG".into(),
        )];
        let cancel = AtomicBool::new(false);
        let run = || {
            let open = |path: &std::path::Path| fs::File::open(path).unwrap();
            coverage(
                open(&cram),
                io::BufReader::new(open(&fasta)),
                open(&directory.path().join("reference.fa.fai")),
                &markers,
                &cancel,
            )
        };
        let result = run().unwrap();
        // Keeps the synthetic files for the browser test in e2e/cram.spec.ts.
        if let Some(target) = std::env::var_os("ROOTS_KEEP_CRAM") {
            let target = std::path::Path::new(&target);
            fs::create_dir_all(target).unwrap();
            for name in ["synthetic.cram", "reference.fa", "reference.fa.fai"] {
                fs::copy(directory.path().join(name), target.join(name)).unwrap();
            }
        }
        assert_eq!(result.reads, 4);
        assert_eq!(result.targets[0].depth, 2);
        assert_eq!(result.targets[0].bases, [0, 1, 1, 0]);
        fs::write(&fasta, ">chr22\nTCCTAGGA\n").unwrap();
        assert!(run().is_err());
    }
}
