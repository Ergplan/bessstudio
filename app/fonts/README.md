# Typefaces

The Latin subsets of **Inter** and **IBM Plex Mono**, checked in so the product's own type never
depends on a network.

They were loaded through `next/font/google` before, which self-hosts the files in the export and so
removed the *run-time* request — but it fetches them from `fonts.googleapis.com` while compiling, so
`npm run dev` failed outright on a machine that could not reach Google, reporting a Turbopack
resolver error rather than a network one. Vendoring removes the dependency instead of moving it.

| File | Family | Weight |
| --- | --- | --- |
| `Inter-Regular.woff2` | Inter | 400 |
| `Inter-Medium.woff2` | Inter | 500 |
| `Inter-SemiBold.woff2` | Inter | 600 |
| `Inter-Bold.woff2` | Inter | 700 |
| `IBMPlexMono-Regular.woff2` | IBM Plex Mono | 400 |
| `IBMPlexMono-Medium.woff2` | IBM Plex Mono | 500 |

About 126 kB in total. Latin only (`U+0000–00FF` and the usual punctuation and currency ranges); the
CSS fallback stacks cover anything outside it.

Both families are licensed under the **SIL Open Font License 1.1**, which permits redistribution
with the software:

- Inter — <https://github.com/rsms/inter>, © 2016 The Inter Project Authors
- IBM Plex Mono — <https://github.com/IBM/plex>, © 2017 IBM Corp

To refresh a weight, take the `U+0000-00FF` (latin) `@font-face` block from
`https://fonts.googleapis.com/css2?family=<Family>:wght@<weight>&display=swap` requested with a
modern browser user agent, and download the `.woff2` it names.
