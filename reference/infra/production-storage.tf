locals {
  docs_tags = merge(local.common_tags, {
    workload    = "document-storage"
    data_class  = "sensitive"
    criticality = "medium"
  })
}

module "storage" {
  source                   = "../../modules/storage"
  location                 = var.location
  account_name             = var.document_storage_account_name
  account_replication_type = "ZRS"
  # Public access is already disabled and the blob private endpoint is live.
  # Add default-deny without removing the existing trusted-service exception.
  configure_network_rules      = true
  network_rule_bypass          = "AzureServices"
  diagnostic_setting_name      = "diagnostics-workforce-documents-blob-production"
  container_names              = var.document_container_names
  tags                         = local.docs_tags
  log_analytics_workspace_id   = azurerm_log_analytics_workspace.platform.id
  admins_group_object_id       = var.docs_admins_group_object_id
  contributors_group_object_id = var.docs_contributors_group_object_id
  readers_group_object_id      = var.docs_readers_group_object_id
  resource_group_name          = "rg-workforce-documents-production-centralus"
}
