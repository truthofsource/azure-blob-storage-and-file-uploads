export const documentTypeConfig = {
  tax_document: { workflowArea: "payroll", containerName: "payroll-packets" },
  employment_i9: { workflowArea: "employment", containerName: "employment-applications" },
  employment_w4: { workflowArea: "payroll", containerName: "payroll-packets" },
  timesheet_raw: {
    workflowArea: "timesheets",
    containerName: "timesheets-raw",
  },
  employment_application: {
    workflowArea: "employment",
    containerName: "employment-applications",
  },
  background_check: {
    workflowArea: "background_checks",
    containerName: "background-checks",
  },
  mco_authorization: {
    workflowArea: "authorizations",
    containerName: "mco-authorizations",
  },
  payroll_packet: {
    workflowArea: "payroll",
    containerName: "payroll-packets",
  },
  billing_evidence: {
    workflowArea: "billing",
    containerName: "billing-evidence",
  },
  audit_evidence: {
    workflowArea: "audit",
    containerName: "audit-evidence",
  },
  policy_procedure: {
    workflowArea: "compliance",
    containerName: "audit-evidence",
  },
  other: {
    workflowArea: "general",
    containerName: "audit-evidence",
  },
} as const;
