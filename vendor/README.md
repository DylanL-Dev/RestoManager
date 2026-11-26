# QR Code Generator

`qrcode-generator-1.4.4.js` is an unmodified copy of `qrcode.js` from the npm package `qrcode-generator@1.4.4`, by Kazuhiko Arase, licensed under MIT. The copyright and license notice remain in the source. No CDN or external image service is used.

SHA-256: `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`.

The exact package and its registry integrity are recorded in package-lock.json. Unit tests compare this vendored file to that checksum and independently decode generated codes with jsQR. The library is loaded only by the employee page; it is excluded from the public build allowlists.

# Supabase JavaScript SDK (RM-SEC-03)

`supabase-js-2.119.0.umd.js` is an unmodified copy of `dist/umd/supabase.js` from `@supabase/supabase-js@2.119.0`, the version pinned in `package-lock.json`. MIT licence: `LICENSE-supabase-js.txt`.

SHA-256: `a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce`.

`supabase-js.mjs` is the only entry point used by the application (staff, Restaurant/Reception bridge, Creator, recovery, signup). The browser build declares a top-level `var supabase`, so the entry point injects it as a classic script (same origin, compatible with `script-src 'self'`) and re-exports `createClient`. Every space therefore uses one SDK version and no CDN. A unit test checks that the vendored file is byte-identical to the locked npm package.

# jsPDF (RM-SEC-03)

`jspdf-2.5.2.umd.min.js` is an unmodified copy of `dist/jspdf.umd.min.js` from `jspdf@2.5.2`, MIT licence (`LICENSE-jspdf.txt`). The npm tarball was verified against the registry integrity `sha512-myeX9c+p7znDWPk0eTrujCzNjT+CXdXyk7YmJq5nD5V7uLLKmSXnlQ/Jn/kuo3X09Op70Apm0rQSnFWyGK8uEQ==` before extraction; it is not added to `package.json` to avoid eight optional transitive dependencies.

SHA-256: `85ba2cc3ff858a20fa49fe6e457bec863ea40b55a9f3725e58a940e62f6f61a4`.

Loaded on demand by `service-v3-report-download.js` for the PDF report only.
