// Messages between the page and the analysis worker.

export type ExtraKind =
  | "relatives"
  | "family"
  | "trio"
  | "clinical"
  | "gene_validity"
  | "maternal_lineage"
  | "cram";

export type PdfOptions = {
  short?: boolean;
  name?: string | null;
  include_calls?: boolean;
  include_relatives?: boolean;
  include_clinical?: boolean;
  include_lineage?: boolean;
  language: "en" | "de";
  pass?: boolean;
};

type Call =
  | { method: "importDna"; file: File | null }
  | {
      method: "variants";
      query: string;
      chromosome: string | null;
      quality: string | null;
      offset: number;
    }
  | { method: "importExtra"; kind: ExtraKind; files: File[] }
  | { method: "saveOrigins"; entries: string }
  | { method: "loadCatalog"; file: File; key: string }
  | { method: "reset" }
  | { method: "renderPdf"; options: PdfOptions };

export type Request = Call & { id: number };
export type Method = Call["method"];
export type Args<M extends Method> = Omit<Extract<Call, { method: M }>, "method">;

export type Response =
  | { type: "ready"; part: "analysis" | "pdf" }
  | { type: "progress"; read: number; total: number }
  | { type: "result"; id: number; ok: true; value: unknown }
  | { type: "result"; id: number; ok: false; error: string };
