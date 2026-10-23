# Dependency audit status — 2026-10-24

The imported dependency graph has unresolved published advisories. This preview is not yet published to npm. This report records registry metadata, not a validated exploit against a plugin feature.

GitHub initially reported 130 alerts for the complete dependency graph, including development dependencies. Separately, `pnpm audit --prod --json` reported 56 advisory entries: 1 critical, 21 high, 33 moderate and 1 low. Multiple entries can affect the same package; these are not counts of independent exploitable plugin bugs.

| Dependency | Advisory entries | Registry severity |
|---|---:|---|
| `follow-redirects` | 1 | 1 moderate |
| `axios` | 34 | 12 high, 21 moderate, 1 low |
| `protobufjs` | 12 | 1 critical, 5 high, 6 moderate |
| `@protobufjs/utf8` | 1 | 1 moderate |
| `ws` | 2 | 1 high, 1 moderate |
| `qs` | 3 | 3 moderate |
| `form-data` | 1 | 1 high |
| `image-size` | 2 | 2 high |

Most findings enter through `@larksuiteoapi/node-sdk`; `image-size` is a direct dependency. Passing functional tests does not resolve advisories. Review, update and revalidate production dependencies before the first public npm release. The publishing workflow runs `pnpm audit --prod --audit-level high`; the current known high/critical findings block publication through that workflow.

Reproduce with `pnpm install --frozen-lockfile`, then `pnpm audit --prod`.

Review upstream releases and fixed ranges before updating dependencies. Do not force unreviewed major upgrades or assume a lockfile-only fix protects npm consumers: published consumers resolve manifest dependencies independently, so required runtime dependency bounds need review too.

Examples: [protobufjs arbitrary code execution](https://github.com/advisories/GHSA-xq3m-2v4x-88gg), [image-size parser denial of service](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq). Full initial registry entries are in [dependency-audit.json](dependency-audit.json).
