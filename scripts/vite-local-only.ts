// Injects the Content Security Policy as a <meta> tag. The same policy, plus
// frame-ancestors, is sent as an HTTP header through public/_headers.
// Subresource Integrity and the service worker are added after the build by
// scripts/finalize.mjs, from the files as they were written.
import type { Plugin } from "vite";

export const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

// frame-ancestors is ignored in <meta>.
const META_CSP = CSP.split("; ")
  .filter((rule) => !rule.startsWith("frame-ancestors"))
  .join("; ");

export function localOnly(): Plugin {
  return {
    name: "roots-local-only",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${META_CSP}" />`,
        ),
    },
  };
}
