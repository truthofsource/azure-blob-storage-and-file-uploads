# Build your own from scratch: Azure Blob Storage And File Uploads

Your own private Blob container, an Entra-authenticated upload, version/retention settings and an upload/download verification.

Start with a new folder, your own files and your own accounts. The numbered steps below describe the build; no portfolio repository checkout is required. The existing implementation/evidence elsewhere in this repository is a separate reference, not a claim that your new build has already passed.

## Prerequisites

Azure CLI; a dedicated subscription/resource group; permission to create storage and assign your own scoped Blob data role. Use a harmless text file, not employee documents.

Use Bash on Linux/macOS/WSL for Bash blocks and PowerShell for PowerShell blocks. Select the tool versions supported by the official sources below, record the versions you actually install and retain generated dependency locks. Cloud resources, scanner downloads, logs and external AI calls can create costs; review the stated scope before enabling them.

## Create your project folder

Choose a new folder name. These first commands create a blank project; an optional `git init` gives it its own history. Create parent directories in your editor when a later step introduces a nested file.

```bash
mkdir my-azure-blob-storage-and-file-uploads
cd my-azure-blob-storage-and-file-uploads
git init
```

Create `.gitignore` before saving credentials or build outputs:

```gitignore
.venv/
node_modules/
.env
.env.*
local.settings.json
credentials.json
token.json
*.pem
*.key
*.tfstate*
*.tfplan
.terraform/
private*/
captures/
backups/
batch.json
reports/
out/
app-config.local.yaml
```

The source/file snippets are a starting implementation you type or paste into the named files. Replace `YOUR_*`, names, regions and addresses only with values from your own lab; do not place real client/employee records in a test project. Keep your terminal in this project root unless a step explicitly changes directory.

Before a first commit, set your own repository-local author with `git config user.name "YOUR_NAME"` and `git config user.email "YOUR_PUBLIC_COMMIT_EMAIL"`. Review `git status --short` and the staged diff before publishing; ignored local files are not a substitute for reviewing what you upload.

## Step 1 — Create an account and define its access boundary

**Where:** Azure Portal → Storage accounts → Create.

Create a new StorageV2 account with TLS 1.2 or later, anonymous Blob access disabled and Shared Key disabled. On Networking choose your approved access path; for a workstation lab, Selected networks plus your exact public IP is different from a private endpoint.

**Check before continuing:** You know which network caller is allowed and have not opened anonymous access.

## Step 2 — Grant only the upload role

**Where:** Storage account → Access control (IAM).

Assign Storage Blob Data Contributor at this lab account or container scope to your own test identity. Management Contributor alone is not a Blob data read/write grant; wait for propagation instead of using account keys.

**Check before continuing:** The named identity and exact data scope are visible in IAM.

## Step 3 — Create the container and retention policy

**Where:** Storage account → Data storage → Containers; Data management → Data protection.

Create a private container named documents. Enable versioning and choose your own blob/container soft-delete periods after considering storage costs and the project retention requirement.

**Check before continuing:** The container is private and the selected recovery settings are recorded.

## Step 4 — Create and upload your own harmless file

**Where:** Your new project folder, Bash / WSL.

Create hello.txt and upload it through Entra login. Replace the account name below with your own; keep the file private and use overwrite=false for a new object.

```bash
printf 'My upload test
' > hello.txt
az login
az storage blob upload --account-name "YOUR_ACCOUNT" --container-name documents   --name hello.txt --file hello.txt --auth-mode login --overwrite false
az storage blob show --account-name "YOUR_ACCOUNT" --container-name documents   --name hello.txt --auth-mode login --query '{etag:properties.etag,length:properties.contentLength}'
```

**Check before continuing:** The upload returns success and the private blob exists.

## Step 5 — Verify content and an unauthorized request

**Where:** Your terminal and a separate unauthenticated client.

Download the file with the permitted identity and compare its SHA-256 with the original. Open its ordinary blob URL without credentials and confirm the content is not disclosed; record network denial separately from identity denial.

```bash
az storage blob download --account-name "YOUR_ACCOUNT" --container-name documents   --name hello.txt --file downloaded.txt --auth-mode login
sha256sum hello.txt downloaded.txt
```

**Check before continuing:** The permitted download matches the upload, and the unauthenticated request does not return its contents.

## Step 6 — Exercise recovery and clean up

**Where:** Storage Explorer / Azure Portal.

Delete only the test blob, recover it through the selected soft-delete/version interface, and verify its contents again. Record the recovery result and remove this isolated lab after reviewing retained versions, soft-deleted data and costs.

**Check before continuing:** You have upload, denied-access and recovery evidence from your own account.

## Verification and your own screenshots

| Evidence | What to record | Your result |
| --- | --- | --- |
| New build | Your own files/resource settings and tool versions | Not yet recorded |
| Working path | The actual successful request, configuration or recovery result | Not yet recorded |
| Failure boundary | A meaningful denied, malformed, stale or failed case | Not yet recorded |
| Recovery / cleanup | What you restored or removed and what remains billed | Not yet recorded |

Capture your own architecture/configuration, one working result and one failure/recovery result. Keep tokens, credentials, personal records and private identifiers out of public screenshots. Existing portfolio images are references, not evidence that you performed these steps.

## Troubleshooting order

1. Confirm the named file, working directory and selected tool/interpreter.
2. Check the exact input and resource/account selected for the failing step.
3. Separate identity permission, network/DNS reachability and application validation.
4. Keep the actual error and reconcile an unknown write outcome before repeating it; do not widen access or repeat paid operations blindly.

The numbered steps describe a build procedure. Local syntax checks, an accepted API request, a completed hosted operation and a human verification are different evidence levels; fill in the verification table with what you actually observed.

## Official implementation references

- [learn.microsoft.com — authorize-data-operations-cli](https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-data-operations-cli)
- [learn.microsoft.com — soft-delete-blob-overview](https://learn.microsoft.com/en-us/azure/storage/blobs/soft-delete-blob-overview)

The walkthrough layout follows the prerequisites → creation/configuration → test → verification → troubleshooting → cleanup pattern of the [Splunk project reference](https://github.com/davidharris6/splunk-siem-log-analysis). Its Splunk-specific settings are not copied into unrelated projects.
