import sql from "mssql";
import type { DocumentRow } from "./documentSearchStore.ts";

export type UploadIdentity = { documentId: string; employeeId: string | null; documentType: string; actor: string | null; sha256: string; size: number };
/** A receipt is reusable only for the exact actor, person, kind and bytes. */
export async function readDocumentUploadReceipt(pool: sql.ConnectionPool, expected: UploadIdentity): Promise<DocumentRow | null> {
  const row = (await pool.request().input("receiptId", sql.UniqueIdentifier, expected.documentId)
    .query<DocumentRow & { intakeSha256: string }>(`SELECT d.*,s.sha256 AS intakeSha256 FROM dbo.document_metadata d WITH(UPDLOCK,HOLDLOCK)
      JOIN dbo.staff_document_scans s ON s.document_id=d.document_id WHERE d.document_id=@receiptId;`)).recordset[0];
  if (!row) return null;
  if (row.employee_id?.toLowerCase() !== expected.employeeId?.toLowerCase() || row.document_type !== expected.documentType ||
      row.uploaded_by_object_id?.toLowerCase() !== expected.actor?.toLowerCase() || row.intakeSha256 !== expected.sha256 || Number(row.file_size_bytes) !== expected.size)
    throw new Error("Upload identity belongs to different content or context. Reload the saved document.");
  return row;
}
