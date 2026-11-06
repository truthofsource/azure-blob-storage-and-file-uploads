# Commands and Expected Results

Run these from the project directory. Node 22.23.2 or newer, Python 3.12 and Terraform 1.11 or newer are used. No npm package install is needed. Terraform initialization downloads a provider unless a verified local cache is configured.

## Run actual rules locally

```bash
npm test
npm run demo
python -B scripts/preview.py --port 8140
```

Tests should finish with zero failures. The demo prints allowed and blocked fictional requests, collection mappings and role access. Open `http://127.0.0.1:8140` for the viewer; Ctrl+C stops it. The viewer accepts no uploads and binds only to your computer's loopback address.

## Validate Terraform without Azure

```bash
terraform -chdir=infra/storage init -backend=false
terraform -chdir=infra/storage fmt -check -recursive
terraform -chdir=infra/storage validate
terraform -chdir=infra/storage test
```

Run every command successfully before continuing. The tests supply fictional values and simulate Azure responses. Do not run `apply`: this module is only one part of a deployment, and a private data path must be commissioned separately. The public workflow runs local rules only; it is not a deployment workflow.

## Inspect your own account read-only

Set `RESOURCE_GROUP`, `ACCOUNT`, `CONTAINER` and `BLOB` to resources you are authorized to inspect. These Bash examples are not executed by the demo and do not enable a network endpoint.

```bash
az storage account show --resource-group "$RESOURCE_GROUP" --name "$ACCOUNT" \
  --query '{publicNetwork:publicNetworkAccess,sharedKey:allowSharedKeyAccess,replication:sku.name}'
az storage account blob-service-properties show \
  --resource-group "$RESOURCE_GROUP" --account-name "$ACCOUNT"
az storage container list --account-name "$ACCOUNT" --auth-mode login \
  --query '[].name'
az storage blob show --account-name "$ACCOUNT" --container-name "$CONTAINER" \
  --name "$BLOB" --auth-mode login \
  --query '{etag:properties.etag,length:properties.contentLength}'
```

Account settings use the management plane. Listing containers and reading blobs use the data plane: they can fail while account inspection works. Check both network reachability and data permissions. Avoid printing sensitive names, contents or metadata into public terminals/screenshots.

## Find failed storage operations in Log Analytics

```kusto
StorageBlobLogs
| where TimeGenerated > ago(1h)
| where toint(StatusCode) >= 400
| summarize Requests=count() by OperationName, StatusCode, bin(TimeGenerated, 15m)
```

This example assumes resource-specific storage tables are enabled and logs have arrived. The copied module leaves the diagnostic destination mode at the provider default; that can route records to `AzureDiagnostics` instead. Check the actual destination and schema before relying on a query. An empty result is not proof that logs are enabled.
