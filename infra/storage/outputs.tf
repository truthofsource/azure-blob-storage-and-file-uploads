output "resource_group_id" {
  value = azurerm_resource_group.docs_nonproduction.id
}

output "resource_group_name" {
  value = azurerm_resource_group.docs_nonproduction.name
}

output "location" {
  value = azurerm_resource_group.docs_nonproduction.location
}

output "account_id" {
  value = azurerm_storage_account.docs.id
}

output "account_name" {
  value = azurerm_storage_account.docs.name
}

output "blob_endpoint" {
  value = azurerm_storage_account.docs.primary_blob_endpoint
}

output "container_names" {
  value = [for container in azurerm_storage_container.docs : container.name]
}

output "archive_scope" {
  value      = azurerm_storage_account.docs.id
  depends_on = [azurerm_storage_container.docs]
}
