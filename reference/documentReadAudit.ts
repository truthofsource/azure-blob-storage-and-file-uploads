import sql from "mssql";

export type DocumentReadAudit = {
  actorId: string;
  requestId: string;
  operation: "document_list" | "document_search" | "document_download";
  documentIds: string[];
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateDocumentReadAudit(event: DocumentReadAudit) {
  if (!uuid.test(event.actorId) || !event.requestId || event.requestId.length > 100 ||
      !["document_list", "document_search", "document_download"].includes(event.operation) ||
      event.documentIds.length > 100 || event.documentIds.some(id => !uuid.test(id))) {
    throw new Error("Document read audit could not be recorded.");
  }
  // Project only the allowed audit fields, regardless of extra caller properties.
  return { actorId: event.actorId, requestId: event.requestId, operation: event.operation,
    documentIds: [...event.documentIds], resultCount: event.documentIds.length };
}

export async function auditDocumentRead(pool: sql.ConnectionPool, event: DocumentReadAudit) {
  const safe = validateDocumentReadAudit(event);
  await pool.request().input("actor", sql.UniqueIdentifier, safe.actorId)
    .input("requestId", sql.NVarChar(100), safe.requestId)
    .input("operation", sql.NVarChar(32), safe.operation)
    .input("records", sql.NVarChar(sql.MAX), JSON.stringify(safe.documentIds))
    .input("count", sql.Int, safe.resultCount)
    .query(`INSERT dbo.sensitive_record_access_audit(actor_object_id,request_id,operation,record_ids_json,result_count)
      VALUES(@actor,@requestId,@operation,@records,@count);`);
}
