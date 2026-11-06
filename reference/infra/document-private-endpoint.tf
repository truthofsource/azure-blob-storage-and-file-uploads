# Reuse the production Blob private DNS zone and VNet link already present in
# the connectivity resource group. The recovery root also relies on this zone.
data "azurerm_private_dns_zone" "storage_blob" {
  name                = "privatelink.blob.core.windows.net"
  resource_group_name = module.network.resource_group_name
}

resource "azurerm_private_endpoint" "documents_blob" {
  name                = "pe-docs-blob-production-001"
  resource_group_name = module.network.resource_group_name
  location            = module.network.location
  subnet_id           = module.network.private_endpoints_subnet_id

  private_service_connection {
    name                           = "psc-docs-blob-production-001"
    private_connection_resource_id = module.storage.account_id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "pdzg-docs-blob-production-001"
    private_dns_zone_ids = [data.azurerm_private_dns_zone.storage_blob.id]
  }

  tags = local.docs_tags
}
