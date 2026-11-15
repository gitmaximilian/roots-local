export type Confidence = "high" | "moderate" | "low";
export type Status = "personal" | "research" | "missing";
export type Section = { id: string; title: string; scope: string };
export type Chapter = {
  id: string;
  title: string;
  part: string;
  sections: Section[];
};
export type MarkerCheck = {
  id: string;
  gene: string;
  coordinate: string | null;
  call: string | null;
  status: string;
};
export type Finding = {
  id: string;
  section: string;
  title: string;
  summary: string;
  status: Status;
  message: string;
  conclusion: string | null;
  confidence: Confidence | null;
  dosage: number | null;
  effect?: { marker: string; allele: string; clinical: boolean };
  clinical?: boolean;
  questions?: string[];
  evidence: string;
  population: string;
  limits: string;
  checks: MarkerCheck[];
  sources: [string, string][];
  cross: string[];
  study?: {
    reported_trait: string;
    accession: string;
    p_value: string;
    effect: string;
    effect_context: string;
  };
};
export type Report = {
  scores: {
    id: string;
    title: string;
    population: string;
    source: string;
    matched: number;
    total: number;
    raw: number | null;
  }[];
  catalog_version: string;
  gwas_total: number;
  example: boolean;
  chapters: Chapter[];
  findings: Finding[];
  summary: {
    format: string;
    build: string | null;
    rows: number;
    skipped: number;
    no_call: number;
    conflicts: number;
    duplicates: number;
    strand: string;
    chromosomes: [string, number][];
    sex_check: {
      x_called: number;
      x_heterozygous: number;
      y_called: number;
      pattern: "xx" | "xy" | null;
    };
  };
  external: {
    origins: { label: string; percent: number | null }[];
    matches: { name: string; cm: number; relationship: string | null }[];
    segments: {
      name: string;
      chromosome: string;
      start: number;
      end: number;
      cm: number;
    }[];
  };
  maternal_lineage: {
    tool_version: string;
    tree: string;
    covered_positions: number;
    candidates: { haplogroup: string; quality: number }[];
    warnings: number;
    errors: number;
  } | null;
  family: {
    compared: number;
    compatible: number;
    discordant: number;
    identical: number;
    kinship: number | null;
    kinship_markers: number;
  } | null;
  trio: {
    compared: number;
    phased_heterozygous: number;
    ambiguous: number;
    homozygous: number;
    inconsistent: number;
    assignments: {
      marker: string;
      chromosome: number;
      position: number;
      first: string;
      second: string;
    }[];
  } | null;
  clinical: {
    build: string;
    release: string;
    gene_validity: {
      date: string;
      records: {
        gene: string;
        hgnc: string;
        disease: string;
        mondo: string;
        inheritance: string;
        classification: string;
        evidence_url: string;
      }[];
    } | null;
    variants: {
      id: number;
      marker: string;
      chromosome: string;
      position: number;
      copies: number;
      alternate: string;
      classifications: string;
      conflicting_classifications: string;
      review_status: string;
      conditions: string;
    }[];
  } | null;
  sequence: {
    reads: number;
    build: string;
    targets: {
      id: string;
      coordinate: string;
      depth: number;
      bases: number[];
    }[];
  } | null;
};
export type Variant = {
  id: string;
  chromosome: string;
  position: number;
  alleles: string | null;
  quality: VariantQuality;
};
export type VariantQuality = "present" | "no_call" | "conflict";
export type VariantPage = {
  total: number;
  offset: number;
  page_size: number;
  rows: Variant[];
};
export type Page =
  "home" | "chapters" | "atlas" | "variants" | "report" | "pass" | "data";
export type Options = {
  short: boolean;
  name: string | null;
  include_calls: boolean;
  include_relatives: boolean;
  include_clinical: boolean;
  include_lineage: boolean;
};
