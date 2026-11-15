# Where the Code Came From

This project extracts actual storage and application file-handling code from a workforce platform. Public labels are fictional; no private Git history, employee files, tenant identifiers or deployment credentials are included.

| Public location | Origin and adaptations |
| --- | --- |
| `infra/storage/` | Actual reusable storage module and four original network-policy tests, plus one new recovery/access regression; neutral labels |
| `src/documents/` | Actual catalog/access rules and original tests; only the pure read-audit validator is extracted from its SQL file |
| `src/contracts/` | Actual applicant-upload parser, content validation and original tests |
| `src/stage2/` | Actual packet/item upload rules and original tests |
| `reference/` | Actual route, SQL receipt/audit and production storage/private-endpoint source; requires omitted application/infrastructure dependencies |
| `scripts/`, `preview/` | New local demonstration and viewer, using fictional inputs and the included real rules |
| `.github/workflows/` | New manual-only local check; no Azure credentials or deployment |

Relative TypeScript imports use `.ts` so Node can execute selected files directly. The role prefix becomes `Workforce`. SQL writing is omitted from the runnable audit-validator copy; its complete original structure remains in `reference/`. These changes do not claim a full application build.

[The machine-readable source map](source-map.json) records each original source path and its SHA-256 before public adaptations. It does not include private absolute paths or require access to the original repository. Checks prove local behavior and source consistency, not live Azure configuration.
