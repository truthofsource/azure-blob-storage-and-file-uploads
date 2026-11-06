# Mocked plan tests only: no Azure backend, credentials or resource changes.
mock_provider "azurerm" {
  mock_resource "azurerm_storage_account" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-synthetic-storage/providers/Microsoft.Storage/storageAccounts/stsyntheticpolicy001"
    }
  }
}

variables {
  location                     = "centralus"
  account_name                 = "stsyntheticpolicy001"
  resource_group_name          = "rg-synthetic-storage"
  container_names              = ["synthetic-documents"]
  tags                         = { purpose = "synthetic-policy-test" }
  log_analytics_workspace_id   = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-synthetic-monitor/providers/Microsoft.OperationalInsights/workspaces/law-synthetic-policy"
  admins_group_object_id       = "00000000-0000-0000-0000-000000000002"
  contributors_group_object_id = "00000000-0000-0000-0000-000000000003"
  readers_group_object_id      = "00000000-0000-0000-0000-000000000004"
}

run "default_deny_without_trusted_service_bypass" {
  command = plan

  assert {
    condition = (
      azurerm_storage_account.docs.public_network_access_enabled == false &&
      azurerm_storage_account.docs.shared_access_key_enabled == false &&
      azurerm_storage_account.docs.allow_nested_items_to_be_public == false &&
      azurerm_storage_account.docs.network_rules[0].default_action == "Deny" &&
      azurerm_storage_account.docs.network_rules[0].bypass == toset(["None"])
    )
    error_message = "The module must stay private/keyless with default-deny and no trusted-service bypass by default."
  }
}

run "preserve_reviewed_trusted_service_bypass" {
  command = plan
  variables {
    network_rule_bypass = "AzureServices"
  }
  assert {
    condition = (
      azurerm_storage_account.docs.public_network_access_enabled == false &&
      azurerm_storage_account.docs.shared_access_key_enabled == false &&
      azurerm_storage_account.docs.network_rules[0].default_action == "Deny" &&
      azurerm_storage_account.docs.network_rules[0].bypass == toset(["AzureServices"])
    )
    error_message = "Preserving the reviewed bypass must not enable public access or shared keys."
  }
}

run "reject_wildcard_bypass" {
  command = plan
  variables {
    network_rule_bypass = "*"
  }
  expect_failures = [var.network_rule_bypass]
}

run "reject_unreviewed_bypass" {
  command = plan
  variables {
    network_rule_bypass = "Logging"
  }
  expect_failures = [var.network_rule_bypass]
}

# Added public regression: recovery and collection access must remain explicit.
run "retain_recovery_and_private_collection_settings" {
  command = plan
  override_resource {
    target          = azurerm_storage_account.docs
    override_during = plan
    values = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-synthetic-storage/providers/Microsoft.Storage/storageAccounts/stsyntheticpolicy001"
    }
  }
  assert {
    condition = (
      azurerm_storage_account.docs.blob_properties[0].versioning_enabled == true &&
      azurerm_storage_account.docs.blob_properties[0].delete_retention_policy[0].days == 30 &&
      azurerm_storage_account.docs.blob_properties[0].container_delete_retention_policy[0].days == 30 &&
      azurerm_storage_container.docs["synthetic-documents"].container_access_type == "private" &&
      azurerm_role_assignment.docs_readers_blob_data_reader.scope == azurerm_storage_account.docs.id &&
      azurerm_role_assignment.docs_readers_blob_data_reader.role_definition_name == "Storage Blob Data Reader"
    )
    error_message = "Preserve versioning, recovery windows, private collections and the documented account-scoped reader grant."
  }
}
