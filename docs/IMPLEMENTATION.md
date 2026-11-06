# How Files Reach Storage

## Account, container and blob

An account controls settings such as network access, replication and recovery. A container groups objects inside that account. A blob is one stored object: for example, a PDF or photo. Names such as `staff/<document-id>/report.pdf` use prefixes to organize objects. This project does not enable the hierarchical namespace used for real directory semantics in Data Lake Storage.

The actual catalog routes `background_check` to `background-checks`, `payroll_packet` to `payroll-packets`, and `timesheet_raw` to `timesheets-raw`. Policies and some audit material share `audit-evidence`. These are catalog examples, not a fresh inventory of live containers. Stage 2 intake uses its own protected path; it is not automatically the same route as the staff library.

## Upload and retry sequence

1. The full API verifies the caller or applicant session and the requested operation.
2. The included upload contract validates allowed fields, base64 content, size, extension and supported byte signatures. A recognized file header is not a complete decoder or proof that a file is harmless.
3. Packet rules check whether the packet and item may be changed. An accepted document cannot be silently replaced. HEIC/HEIF is allowed for government ID items, not every document item.
4. The staff route uses `DefaultAzureCredential` and a managed identity in Azure. It conditionally creates an intake object with `ifNoneMatch: '*'`, which refuses an overwrite of an existing object.
5. The route saves ownership and processing metadata in SQL. Its receipt checks document ID, person, actor, type, content hash and size. It also retains the intake ETag, Azure's object-version marker, for the scan process. The hash and ETag have different purposes; neither is a malware verdict.
6. The separate scanner correlates the result with the expected object before releasing it. Pending or unknown states remain unavailable. See the dedicated malware project for the scanner implementation.
7. Retrieval checks document access again. A private URL or container name alone does not prove the requester is authorized.

The full route and SQL receipt are reference files with dependencies on the private application's authentication, database and scanner components. They are not a standalone HTTP server. Only the explicitly selected pure rules and validators run here.

## Two layers of access control

The storage module creates three **account-scoped** group grants: Blob Data Owner, Contributor and Reader. They are infrastructure permissions, not per-person business rules. Anyone with direct data access may bypass the API's filtering, so grant membership must be restricted and reviewed.

The API separately restricts library document types. HR is not Payroll. Unknown roles get `1 = 0`, a database condition that returns no records. I-9 and W-4 forms are excluded from this general library even for Admin and use their employee-scoped routes. The public role prefix is `Workforce`; it is an adaptation, not a real tenant configuration.

## Terraform boundary

The module creates a resource group, one StorageV2 account, private containers, read/write/delete diagnostics and three group grants. Defaults include LRS replication, Hot access, TLS 1.2, HTTPS-only access, no anonymous containers, no Shared Key, versioning and 30-day blob/container soft deletion.

Public access is disabled. A separate network path is required before data operations can succeed. The module does not create a private endpoint, DNS zone, caller VNet integration, Log Analytics workspace or groups. The production reference shows ZRS and a reviewed `AzureServices` exception, plus a separate Blob private endpoint using an existing private DNS zone. These are contextual source files, not a second runnable root.

Managed identity authenticates the caller; it does not automatically create network reachability. Preserve necessary service exceptions only after checking their actual callers. Do not enable public access simply to get a deployment through.

## Recovery and records

Versioning retains earlier blob versions. Soft deletion provides a 30-day recovery period for deleted blobs and containers in this module. These controls do not restore SQL references, application configuration, identities or a deleted storage account. Recovery must match a file to its database record and preserve its check status.

References: [Blob Storage concepts](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-introduction), [Entra authorization](https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-access-azure-active-directory), [versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview).
