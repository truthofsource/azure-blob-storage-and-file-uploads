variable "location" {
  type = string
}

variable "account_name" {
  type = string
}

variable "account_replication_type" {
  type    = string
  default = "LRS"
}

variable "configure_network_rules" {
  type    = bool
  default = true
}

variable "network_rule_bypass" {
  description = "Explicit trusted-service policy; preserve a reviewed existing exception when adding default-deny rules."
  type        = string
  default     = "None"

  validation {
    condition     = contains(["None", "AzureServices"], var.network_rule_bypass)
    error_message = "Use None or the explicitly reviewed AzureServices exception."
  }
}

variable "diagnostic_setting_name" {
  type    = string
  default = null
}

variable "container_names" {
  type = list(string)
}

variable "tags" {
  type = map(string)
}

variable "log_analytics_workspace_id" {
  type = string
}

variable "admins_group_object_id" {
  type = string
}

variable "contributors_group_object_id" {
  type = string
}

variable "readers_group_object_id" {
  type = string
}

variable "resource_group_name" {
  type = string
}
