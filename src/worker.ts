/// <reference lib="webworker" />
// Runs the Rust analysis and the Typst PDF renderer off the main thread.
// Files arrive as File objects through postMessage and are read here with
// FileReaderSync. This worker has no network code: the only requests it makes
// are for the app's own WebAssembly and font files, from the same origin.

import init, { Session } from "./generated/roots_wasm.js";
import analysisUrl from "./generated/roots_wasm_bg.wasm?url";
import pdfUrl from "./generated/roots_pdf_wasm_bg.wasm?url";
import { fontUrls } from "./fonts";
import type { Request, Response } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let cancelFlag: Int32Array | undefined;
let lastProgress = 0;

Object.assign(globalThis, {
  rootsCancelRequested: () =>
    cancelFlag !== undefined && Atomics.load(cancelFlag, 0) === 1,
  rootsProgress: (read: number, total: number) => {
    const now = performance.now();
    if (now - lastProgress < 100 && read < total) return;
    lastProgress = now;
    post({ type: "progress", read, total });
  },
});

function post(message: Response, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

const ready = init({ module_or_path: analysisUrl }).then(() => new Session());

type PdfModule = typeof import("./generated/roots_pdf_wasm.js");
let pdf: Promise<PdfModule> | undefined;
function loadPdf(): Promise<PdfModule> {
  pdf ??= (async () => {
    const module = await import("./generated/roots_pdf_wasm.js");
    await module.default({ module_or_path: pdfUrl });
    const fonts = await Promise.all(
      fontUrls.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error("font");
        return new Uint8Array(await response.arrayBuffer());
      }),
    );
    module.load_fonts(fonts);
    return module;
  })();
  pdf.catch(() => (pdf = undefined));
  return pdf;
}

async function handle(request: Request): Promise<unknown> {
  const session = await ready;
  session.begin();
  switch (request.method) {
    case "importDna":
      return JSON.parse(session.import_dna(request.file ?? undefined));
    case "variants":
      return JSON.parse(
        session.variants(
          request.query,
          request.chromosome ?? undefined,
          request.quality ?? undefined,
          request.offset,
        ),
      );
    case "importExtra":
      return JSON.parse(session.import_extra(request.kind, request.files));
    case "saveOrigins":
      return JSON.parse(session.save_origins(request.entries));
    case "loadCatalog":
      return JSON.parse(session.load_catalog(request.file, request.key));
    case "reset":
      session.reset();
      return null;
    case "renderPdf": {
      const data = session.prepare_pdf(JSON.stringify(request.options));
      const module = await loadPdf();
      return module.render(!!request.options.pass, data);
    }
    case "preloadPdf":
      await loadPdf();
      return null;
  }
}

self.onmessage = (event: MessageEvent<Request | { type: "cancel-flag"; flag: SharedArrayBuffer }>) => {
  const message = event.data;
  if ("type" in message) {
    cancelFlag = new Int32Array(message.flag);
    return;
  }
  handle(message).then(
    (value) => {
      const transfer = value instanceof Uint8Array ? [value.buffer] : [];
      post({ type: "result", id: message.id, ok: true, value }, transfer);
    },
    (error: unknown) =>
      post({
        type: "result",
        id: message.id,
        ok: false,
        error: typeof error === "string" ? error : "",
      }),
  );
};
