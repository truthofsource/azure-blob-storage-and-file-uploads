import assert from "node:assert/strict";
import test from "node:test";
import { allowedDocumentTypes, documentAccessPlan } from "./documentAccess.ts";
import { validateDocumentReadAudit } from "./documentReadAudit.ts";

test("HR can access personnel and policies without payroll or client records", () => {
  assert.deepEqual(allowedDocumentTypes(["Workforce.HR"]), ["employment_application", "background_check", "policy_procedure"]);
});
test("payroll is separate from HR while Admin retains audited business access", () => {
  for (const roles of [["Workforce.HR"]]) {
    assert.ok(!allowedDocumentTypes(roles).includes("payroll_packet"));
    assert.ok(!allowedDocumentTypes(roles).includes("timesheet_raw"));
  }
  assert.deepEqual(allowedDocumentTypes(["Workforce.Payroll"]), ["tax_document", "timesheet_raw", "payroll_packet"]);
  assert.ok(allowedDocumentTypes(["Workforce.Admin"]).includes("payroll_packet"));
});
test("operational roles and unrecognized roles cannot gain archive access", () => {
  for (const roles of [[], ["Workforce.Supervisor"], ["Workforce.Caregiver"], ["Workforce.Admin' OR 1=1"]]) {
    assert.deepEqual(documentAccessPlan(roles), { parameters: {}, where: "1 = 0", types: [] });
  }
});
test("sharing a container with policies does not expose unclassified audit records", () => {
  const plan = documentAccessPlan(["Workforce.HR"]);
  assert.match(plan.where, /^document_type IN/);
  assert.ok(!Object.values(plan.parameters).includes("other"));
  assert.ok(!Object.values(plan.parameters).includes("audit_evidence"));
});

test("read audit records attribution and opaque IDs while rejecting invalid or excessive events", () => {
  const event = { actorId: "11111111-1111-4111-8111-111111111111", requestId: "request", operation: "document_search" as const, documentIds: ["22222222-2222-4222-8222-222222222222"] };
  const safe = validateDocumentReadAudit({ ...event, searchText: "private" } as typeof event);
  assert.equal(safe.resultCount, 1);
  assert.ok(!JSON.stringify(safe).includes("private"));
  assert.throws(() => validateDocumentReadAudit({ ...event, actorId: "" }));
  assert.throws(() => validateDocumentReadAudit({ ...event, documentIds: Array(101).fill(event.documentIds[0]) }));
  assert.throws(() => validateDocumentReadAudit({ ...event, documentIds: ["private-name"] }));
});

test("tax documents use payroll access without opening protected employee forms",()=>{
 for(const role of ["Workforce.Payroll","Workforce.Admin"]) {const allowed=allowedDocumentTypes([role]);assert.ok(allowed.includes("tax_document"));assert.ok(!allowed.includes("employment_w4"));assert.ok(!allowed.includes("employment_i9"));}
 for(const role of ["Workforce.HR","Workforce.Supervisor","Workforce.Caregiver"]) assert.ok(!allowedDocumentTypes([role]).includes("tax_document"));
});
