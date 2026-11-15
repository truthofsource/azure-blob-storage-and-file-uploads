resource "azurerm_resource_group" "docs_nonproduction" {
  name     = var.resource_group_name
  location = var.location

  tags = var.tags
}

resource "azurerm_storage_account" "docs" {
  name                = var.account_name
  resource_group_name = azurerm_resource_group.docs_nonproduction.name
  location            = azurerm_resource_group.docs_nonproduction.location

  account_kind             = "StorageV2"
  account_tier             = "Standard"
  account_replication_type = var.account_replication_type
  access_tier              = "Hot"

  min_tls_version                   = "TLS1_2"
  https_traffic_only_enabled        = true
  allow_nested_items_to_be_public   = false
  public_network_access_enabled     = false
  shared_access_key_enabled         = false
  default_to_oauth_authentication   = true
  cross_tenant_replication_enabled  = false
  infrastructure_encryption_enabled = true

  dynamic "network_rules" {
    for_each = var.configure_network_rules ? [1] : []
    content {
      default_action             = "Deny"
      bypass                     = [var.network_rule_bypass]
      ip_rules                   = []
      virtual_network_subnet_ids = []
    }
  }

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 30
    }

    container_delete_retention_policy {
      days = 30
    }
  }

  tags = var.tags
}

resource "azurerm_storage_container" "docs" {
  for_each = toset(var.container_names)

  name                  = each.value
  storage_account_id    = azurerm_storage_account.docs.id
  container_access_type = "private"
}

resource "azurerm_monitor_diagnostic_setting" "docs_blob_service" {
  name                       = coalesce(var.diagnostic_setting_name, "diag-${var.account_name}-blob")
  target_resource_id         = "${azurerm_storage_account.docs.id}/blobServices/default/"
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_log {
    category = "StorageRead"
  }

  enabled_log {
    category = "StorageWrite"
  }

  enabled_log {
    category = "StorageDelete"
  }
}

resource "azurerm_role_assignment" "docs_admins_blob_data_owner" {
  scope                = azurerm_storage_account.docs.id
  role_definition_name = "Storage Blob Data Owner"
  principal_id         = trimspace(var.admins_group_object_id)
  principal_type       = "Group"
}

resource "azurerm_role_assignment" "docs_contributors_blob_data_contributor" {
  scope                = azurerm_storage_account.docs.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = trimspace(var.contributors_group_object_id)
  principal_type       = "Group"
}

resource "azurerm_role_assignment" "docs_readers_blob_data_reader" {
  scope                = azurerm_storage_account.docs.id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = trimspace(var.readers_group_object_id)
  principal_type       = "Group"
}
