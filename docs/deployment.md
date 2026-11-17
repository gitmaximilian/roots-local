# Web deployment and maintenance

Roots Local v0.3.0 is a static web app. The browser reads local inputs and runs the Rust analysis and Typst PDF engines in WebAssembly. The repository retains desktop history through the v0.2.0 release.

## November 17, 2026 rollout

| Component | State |
| --- | --- |
| App | Build `9697c896d2e990f2` is live on [rootslocal.pages.dev](https://rootslocal.pages.dev/) via [Pages deployment a5538be3](https://a5538be3.rootslocal.pages.dev/). Deployment source is commit `66c8fde`. |
| Custom domain | `rootslocal.maximilianauer.at` is attached to the Pages project. The DNS record and managed certificate await validation. |
| Portfolio | [Project index](https://maximilianauer.at/projects/), planned detail page `/projects/rootslocal/` and privacy section `/legal/#rootslocal` are staged. |

### Code and privacy

- `897e687` replaces the offline cache's all-or-nothing bulk download with smaller batches. Each response must match the build's SHA-256 integrity value. A failed static download gets one retry, and a failed installation removes the partial cache. The worker still asks before activating an update. Browser navigation can trigger the normal service worker update check.
- The document CSP meta tag uses `connect-src 'none'`. The HTTP policy in `public/_headers` allows workers to fetch the app's own static assets. The app has no receiving endpoint. The only browser storage managed by the app is the language setting and the cache of program files. Exports use local downloads. Users' device settings control synchronization of their downloads folder.
- `66c8fde` preserves the synthetic screenshot script and updates the browser tests. The tests wait for service worker activation and handle WebKit's first-page controller behavior before starting the measured workflow. Chromium request recording includes service worker requests. A separate test injects a failed static download during cache setup.
- Cloudflare processes connection metadata when serving files. The public Pages host still adds `NEL` and `Report-To` at the edge even though the app's `_headers` asks to remove them. The legal notice describes what Cloudflare may receive. Check these separately on the custom host.

### Portfolio changes

- `projects/index.html` has a fourth card with a screenshot from the synthetic example, the live badge, technologies and a link to the detail page. The primary button is **Open Roots Local** in English and **Roots Local öffnen** in German.
- `projects/rootslocal/index.html` uses the existing project layout. It describes the file import, browser-only analysis, medicine pass and PDF exports, and links to the source, releases, license and privacy notice. The screenshots in `projects/assets/rootslocal-*` show the synthetic example in light and dark themes. The desktop crops are 2160 × 1350 and the mobile crops are 1179 × 1977.
- `projects/projects.js` contains the English and German copy. The shared script uses cache version `20261117b`. The existing Foliquo, Rookie and Pacepact cards match the previous production HTML, and their detail pages change only the cache version of the shared script.
- `legal/index.html` describes local memory, saved exports, browser storage, Cloudflare connection data and the medical limits in both languages. The app links to `/legal/#rootslocal`.
- The portfolio workspace holds dated backups `before-rootslocal-2026-11-15` and `before-rootslocal-2026-11-17`. Its `PUBLISHING.md` and `deployment.json` track deployment state. The portfolio upload preserves the redirect for legacy TranslateOCR routes.

## Deploy and verify

1. Build and run the tests in the [README](../README.md). Run `(cd dist && shasum -a 256 -c SHA256SUMS)`. Use synthetic files for every verification.
2. Use Direct Upload on branch `main` of the Cloudflare Pages project `rootslocal`. The upload contains only the contents of the app's `dist/`. Cloudflare serves the verified build ID at `/version.txt`.
3. In Pages, attach `rootslocal.maximilianauer.at` to `rootslocal`. In the zone, the exact DNS record is a proxied `CNAME` named `rootslocal` pointing to `rootslocal.pages.dev`. Check that the record has propagated and that the Pages certificate is active. The website's mail DNS records are outside this change.
4. Run `curl -I https://rootslocal.maximilianauer.at/` and check the worker and WebAssembly headers too. Compare the live assets against the build's `SHA256SUMS`. Run the browser suite with `ROOTS_BASE_URL=https://rootslocal.maximilianauer.at npm run test:e2e`. Set `ROOTS_TEST_PYTHON` to an interpreter with `pypdf` to enable PDF text and structure checks.
5. Publish the portfolio to the separate Cloudflare Pages project `maximilianauer`, branch `main`. Check the project index, detail page and legal anchor on the apex, WWW and Pages domains. Update the deployment record with the exact Pages deployment URL.

For rollback, the previous app deployment is [a2cab228](https://a2cab228.rootslocal.pages.dev/) and the previous portfolio deployment is [e03a1226](https://e03a1226.maximilianauer.pages.dev/). Cloudflare Pages supports rolling back the affected project independently.

See [test status](test-status.md) for the exact coverage and remaining physical device and regulatory checks.
