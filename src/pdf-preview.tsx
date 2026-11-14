import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ArrowLeft, ArrowRight } from "lucide-react";

GlobalWorkerOptions.workerSrc = worker;

export function PdfPreview({ bytes }: { bytes: ArrayBuffer }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setPage(1);
    setDocument(undefined);
    setError(false);
    const load = getDocument({
      data: new Uint8Array(bytes.slice(0)),
      isEvalSupported: false,
      useSystemFonts: false,
      useWasm: false,
    });
    load.promise
      .then((result) => {
        if (active) setDocument(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      void load.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    void document
      .getPage(page)
      .then((pdfPage) => {
        const element = canvas.current;
        if (!active || !element) return;
        const viewport = pdfPage.getViewport({ scale: 1.25 });
        element.width = viewport.width;
        element.height = viewport.height;
        render = pdfPage.render({ canvas: element, viewport });
        return render.promise;
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [document, page]);

  if (error)
    return <p role="alert">Die PDF-Vorschau konnte nicht angezeigt werden.</p>;
  return (
    <div className="pdf-pages">
      {document ? (
        <canvas ref={canvas} aria-label={`PDF-Vorschau, Seite ${page}`} />
      ) : (
        <span role="status">PDF wird geöffnet …</span>
      )}
      {document && (
        <div className="pagination">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label="Vorige PDF-Seite"
          >
            <ArrowLeft size={16} />
          </button>
          <span>
            {page} / {document.numPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= document.numPages}
            aria-label="Nächste PDF-Seite"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
