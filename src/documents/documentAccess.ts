import { documentTypeConfig } from "./documentCatalog.ts";

export const documentRoles = ["Workforce.HR", "Workforce.Payroll", "Workforce.Admin"] as const;

// Payroll is not implied by HR. Admin retains explicitly authorized business access.
// Unknown classifications
// fail closed; a shared physical container does not grant access to every type.
export function allowedDocumentTypes(roles: readonly string[]): string[] {
  return Object.keys(documentTypeConfig).filter(type => {
    // Forms are available only through their employee-scoped workflow, including for Admin.
    if (type === "employment_i9" || type === "employment_w4") return false;
    if (roles.includes("Workforce.Admin")) return true;
    if (type === "tax_document" || type === "payroll_packet" || type === "timesheet_raw") return roles.includes("Workforce.Payroll");
    return roles.includes("Workforce.HR") && ["employment_application", "background_check", "policy_procedure"].includes(type);
  });
}

export function documentAccessPlan(roles: readonly string[]) {
  const types = allowedDocumentTypes(roles);
  const parameters: Record<string, string> = {};
  types.forEach((type, index) => { parameters[`accessType${index}`] = type; });
  return {
    parameters,
    where: types.length ? `document_type IN (${types.map((_, index) => `@accessType${index}`).join(", ")})` : "1 = 0",
    types,
  };
}
