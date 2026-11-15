import {createStaffUploadStatusHandler} from "../documents/staffUploadStatus.ts";
import { readDocumentUploadReceipt, type UploadIdentity } from "../documents/documentUploadReceipt.ts";
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobServiceClient,
  type BlockBlobClient,
} from "@azure/storage-blob";
import { randomUUID, createHash } from "crypto";
import { getStage2DocumentIntakeStorageConfiguration } from "../stage2/stage2DocumentIntakeStorage.ts";
import sql from "mssql";
import { requireAnyAppRole } from "../auth/requireAppRole.ts";
import { getSqlPool } from "../db/sqlPool.ts";
import { readStage2I9CollectionPolicy } from "../stage2/stage2I9CollectionPolicy.ts";
import { readStage2W4CollectionPolicy } from "../stage2/stage2W4CollectionPolicy.ts";
import {
  createProtectedDocumentFilters,
  availableDocumentIdentityPredicate,
  protectedDocumentStorageZone,
} from "../documents/protectedDocumentTrustBoundary.ts";

import { documentTypeConfig } from "../documents/documentCatalog.ts";
import { isEmploymentForm, type FormType } from "../payroll/employmentForms.ts";
type VerifiedFormContext = { auth: Extract<Awaited<ReturnType<typeof requireAnyAppRole>>, { ok: true }>; employeeId: string; kind: FormType; documentId?: string };
type VerifiedScreeningContext = { auth: VerifiedFormContext['auth']; employeeId: string | null; applicationId: string | null; uploadKey: string;
  // Internal callback supplied only by the leased Fowler endpoint; never deserialized from HTTP.
  verifyFowlerLease?: () => Promise<void>;
  verifySamBrowserLease?: () => Promise<void> };
type VerifiedDocumentReadContext = Omit<VerifiedFormContext, 'kind' | 'employeeId'> & { kind: FormType | 'background_check'; employeeId: string | null; applicationId?: string | null };
import { allowedDocumentTypes, documentAccessPlan, documentRoles } from "../documents/documentAccess.ts";
import { auditDocumentRead } from "../documents/documentReadAudit.ts";
import { createDocumentSearchHandler } from "../documents/documentSearch.ts";

import { queryDocumentSearch, mapDocument, type DocumentRow } from "../documents/documentSearchStore.ts";

function bindDocumentAccess(request: sql.Request, roles: readonly string[]) {
  const plan = documentAccessPlan(roles);
  for (const [key, value] of Object.entries(plan.parameters)) request.input(key, sql.NVarChar(50), value);
  return plan.where;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const maxUploadBytes = 10 * 1024 * 1024;



type DocumentType = keyof typeof documentTypeConfig;



function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { "Cache-Control": "no-store" },
    jsonBody: body,
  };
}

function getClaimString(claims: Record<string, unknown>, claimName: string) {
  const value = claims[claimName];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getRoleClaims(roleResult: unknown): Record<string, unknown> {
  const maybeClaims = (roleResult as { claims?: unknown }).claims;

  if (maybeClaims && typeof maybeClaims === "object" && !Array.isArray(maybeClaims)) {
    return maybeClaims as Record<string, unknown>;
  }

  return {};
}

function getOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function getRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number
): string {
  const trimmed = getOptionalString(value, fieldName, maxLength);

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function getOptionalUuid(value: unknown, fieldName: string): string | null {
  const trimmed = getOptionalString(value, fieldName, 36);

  if (!trimmed) {
    return null;
  }

  if (!uuidPattern.test(trimmed)) {
    throw new Error(`${fieldName} must be a valid GUID.`);
  }

  return trimmed;
}

function getRequiredDocumentType(value: unknown): DocumentType {
  const documentType = getRequiredString(value, "documentType", 50);

  if (!(documentType in documentTypeConfig)) {
    throw new Error(
      `documentType must be one of: ${Object.keys(documentTypeConfig).join(", ")}.`
    );
  }

  return documentType as DocumentType;
}

function sanitizeFileName(fileName: string) {
  const withoutPath = fileName.split(/[\\/]/).pop() ?? fileName;
  const normalizedName = withoutPath
    .replace(/[^a-zA-Z0-9._() -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedName) {
    throw new Error("originalFileName must include a usable file name.");
  }

  return normalizedName.slice(0, 160);
}

function decodeBase64Content(value: unknown): Buffer {
  const raw = getRequiredString(value, "contentBase64", maxUploadBytes * 2);

  const base64 = raw.startsWith("data:") && raw.includes(",")
    ? raw.slice(raw.indexOf(",") + 1)
    : raw;

  if (!/^[a-zA-Z0-9+/=\r\n]+$/.test(base64)) {
    throw new Error("contentBase64 must be valid base64 content.");
  }

  const buffer = Buffer.from(base64, "base64");

  if (buffer.length === 0) {
    throw new Error("Uploaded file content cannot be empty.");
  }

  if (buffer.length > maxUploadBytes) {
    throw new Error(`Uploaded file must be ${maxUploadBytes} bytes or smaller.`);
  }

  return buffer;
}

function getMetadataJson(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("metadata must be a JSON object.");
  }

  const jsonText = JSON.stringify(value);

  if (jsonText.length > 8000) {
    throw new Error("metadata JSON must be 8000 characters or fewer.");
  }

  return jsonText;
}

function getConfiguredContainerNames() {
  return new Set(
    (process.env.DOCUMENT_STORAGE_CONTAINER_NAMES ?? "")
      .split(",")
      .map((containerName) => containerName.trim())
      .filter((containerName) => containerName.length > 0)
  );
}

function getBlobServiceClient() {
  const blobEndpoint = process.env.DOCUMENT_STORAGE_BLOB_ENDPOINT;

  if (!blobEndpoint) {
    throw new Error("DOCUMENT_STORAGE_BLOB_ENDPOINT app setting is not configured.");
  }

  return new BlobServiceClient(blobEndpoint, new DefaultAzureCredential());
}

function makeBlobName(documentType: DocumentType, documentId: string, fileName: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${documentType}/${year}/${month}/${documentId}-${fileName}`;
}



async function readJsonObject(request: HttpRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body as Record<string, unknown>;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export async function uploadDocument(
  request: HttpRequest,
  context: InvocationContext,
  formContext?: VerifiedFormContext,
  screeningContext?: VerifiedScreeningContext
): Promise<HttpResponseInit> {
  context.log("Processing protected POST /api/documents request.");

  const roleResult = formContext?.auth ?? screeningContext?.auth ?? await requireAnyAppRole(request, documentRoles);

  if (!roleResult.ok) {
    return json(roleResult.status, {
      error: roleResult.error,
    });
  }

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON body.";

    return json(400, {
      ok: false,
      error: message,
    });
  }

  let uploadedBlobClient: BlockBlobClient | null = null;
  let uploadEtag: string | undefined;
  let metadataAttempted = false;
  let uploadIdentity: UploadIdentity | null = null;
  const requestId = body.requestId;
  if (requestId !== undefined && (typeof requestId !== "string" || !uuidPattern.test(requestId))) return json(400, { error: "Use a valid upload request identity." });

  try {
    if (formContext) {
      if (process.env.EMPLOYMENT_FORMS_ENABLED !== "true") return json(409, { error: "Employment form collection is not commissioned." });
      if (formContext.kind === "employment_i9" && !(await readStage2I9CollectionPolicy(await getSqlPool())).collectI9)
        return json(409, { error: "I-9 collection is off. Contact HR if you need help." });
      if (formContext.kind === "employment_w4" && !(await readStage2W4CollectionPolicy(await getSqlPool())).collectW4)
        return json(409, { error: "W-4 collection is off. Contact HR if you need help." });
      body = { documentType: formContext.kind, originalFileName: formContext.kind === "employment_i9" ? "I-9.pdf" : "W-4.pdf", contentType: "application/pdf", contentBase64: body.contentBase64, employeeId: formContext.employeeId, relatedEntityType: "employee", relatedEntityId: formContext.employeeId };
    }
    const documentType = getRequiredDocumentType(body.documentType);
    const fowlerWorker = Boolean(screeningContext?.verifyFowlerLease
      && roleResult.matchedRole === 'Workforce.FowlerRetrievalWorker'
      && typeof roleResult.claims.oid === 'string' && process.env.FOWLER_RETRIEVAL_WORKER_OBJECT_ID
      && roleResult.claims.oid.toLowerCase() === process.env.FOWLER_RETRIEVAL_WORKER_OBJECT_ID.toLowerCase());
    const samBrowserWorker = Boolean(screeningContext?.verifySamBrowserLease
      && roleResult.matchedRole === 'Workforce.SamBrowserWorker'
      && typeof roleResult.claims.oid === 'string' && process.env.SAM_BROWSER_WORKER_OBJECT_ID
      && roleResult.claims.oid.toLowerCase() === process.env.SAM_BROWSER_WORKER_OBJECT_ID.toLowerCase());
    const leasedScreeningWorker = fowlerWorker || samBrowserWorker;
    if (screeningContext && (formContext || documentType !== 'background_check'
      || body.employeeId !== screeningContext.employeeId || body.relatedEntityId !== (screeningContext.applicationId ?? screeningContext.employeeId)
      || body.relatedEntityType !== (screeningContext.applicationId ? 'employment_application' : 'employee')
      || !leasedScreeningWorker && !roleResult.roles.some(role => ['Workforce.HR', 'Workforce.Admin'].includes(role)))) {
      return json(403, { error: 'Screening evidence must belong to the selected employee.' });
    }
    if (isEmploymentForm(documentType) && !formContext) return json(400, { error: "Use Employment forms and documents for this form." });
    if (!formContext && !leasedScreeningWorker && !allowedDocumentTypes(roleResult.roles).includes(documentType)) {
      return json(403, { ok: false, error: "Your permissions do not allow this document type." });
    }
    const config = documentTypeConfig[documentType];

    const configuredContainers = getConfiguredContainerNames();

    if (!configuredContainers.has(config.containerName)) {
      throw new Error(
        `Container ${config.containerName} is not configured for document storage.`
      );
    }

    const documentId = typeof requestId === "string" ? requestId : randomUUID();
    const originalFileName = sanitizeFileName(
      getRequiredString(body.originalFileName, "originalFileName", 260)
    );
    const contentType =
      getOptionalString(body.contentType, "contentType", 200) ??
      "application/octet-stream";
    const fileBuffer = decodeBase64Content(body.contentBase64);
    if (screeningContext && fileBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') return json(400, { error: 'Upload screening evidence as a PDF.' });
    if (formContext && fileBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") return json(400, { error: "Upload a completed PDF form." });
    const relatedEntityType = getOptionalString(
      body.relatedEntityType,
      "relatedEntityType",
      100
    );
    const relatedEntityId = getOptionalUuid(body.relatedEntityId, "relatedEntityId");
    const employeeId = getOptionalUuid(body.employeeId, "employeeId");
    const clientId = getOptionalUuid(body.clientId, "clientId");
    const description = getOptionalString(body.description, "description", 500);
    const metadataJson = getMetadataJson(body.metadata);

    const claims = getRoleClaims(roleResult);
    const uploadedByObjectId =
      getClaimString(claims, "oid") ??
      getClaimString(claims, "sub");
    const uploadedByDisplayName =
      getClaimString(claims, "name") ??
      getClaimString(claims, "preferred_username");
    const uploadedByEmail =
      getClaimString(claims, "preferred_username") ??
      getClaimString(claims, "upn") ??
      getClaimString(claims, "email");

    uploadIdentity = { documentId, employeeId, documentType, actor: uploadedByObjectId, sha256: createHash("sha256").update(fileBuffer).digest("hex"), size: fileBuffer.length };
    if (requestId) {
      const receipt = await readDocumentUploadReceipt(await getSqlPool(), uploadIdentity);
      if (receipt) return json(201, { ok: true, document: mapDocument(receipt), reconciled: true });
    }
    const destinationBlob = `staff/${documentId}/${makeBlobName(documentType, documentId, originalFileName)}`;
    if (fowlerWorker) await screeningContext!.verifyFowlerLease!();
    if (samBrowserWorker) await screeningContext!.verifySamBrowserLease!();
    const blobName = `${documentId}.bin`;

    const intake = getStage2DocumentIntakeStorageConfiguration(process.env);
    const blobServiceClient = new BlobServiceClient(intake.blobEndpoint,new DefaultAzureCredential());
    const containerClient = blobServiceClient.getContainerClient("staff-document-quarantine");
    uploadedBlobClient = containerClient.getBlockBlobClient(blobName);

    let upload: { etag?: string };
    try { upload = await uploadedBlobClient.uploadData(fileBuffer, {
      conditions: { ifNoneMatch: "*" },
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
      metadata: {
        documentid: documentId,
        documenttype: documentType,
        workflowarea: config.workflowArea,
        sha256: uploadIdentity.sha256,
        actor: uploadedByObjectId ?? "",
        employee: employeeId ?? "",
      },
    });
    } catch (error) {
      if (!requestId || (error as { statusCode?: number }).statusCode !== 412) throw error;
      const properties = await uploadedBlobClient.getProperties();
      if (properties.metadata?.sha256 !== uploadIdentity.sha256 || properties.metadata?.actor !== (uploadedByObjectId ?? "") || properties.metadata?.employee !== (employeeId ?? "") || properties.metadata?.documenttype !== documentType || properties.contentLength !== fileBuffer.length)
        throw new Error("Existing upload does not match this request. Reload the document status.");
      upload = { etag: properties.etag };
    }
    if (!upload.etag) throw new Error("Unable to verify the uploaded file version.");
    uploadEtag = upload.etag;

    const pool = await getSqlPool();

    metadataAttempted = true;
    const result = await pool
      .request()
      .input("documentId", sql.UniqueIdentifier, documentId)
      .input("documentType", sql.NVarChar(50), documentType)
      .input("workflowArea", sql.NVarChar(50), config.workflowArea)
      .input(
        "storageZone",
        sql.NVarChar(50),
        "staff_intake"
      )
      .input("containerName", sql.NVarChar(100), "staff-document-quarantine")
      .input("destinationContainer", sql.NVarChar(100), config.containerName)
      .input("destinationBlob", sql.NVarChar(500), destinationBlob)
      .input("intakeEtag", sql.NVarChar(200), upload.etag)
      .input("sha256", sql.Char(64), createHash("sha256").update(fileBuffer).digest("hex"))
      .input("blobName", sql.NVarChar(500), blobName)
      .input("originalFileName", sql.NVarChar(260), originalFileName)
      .input("contentType", sql.NVarChar(200), contentType)
      .input("fileSizeBytes", sql.BigInt, fileBuffer.length)
      .input("relatedEntityType", sql.NVarChar(100), relatedEntityType)
      .input("relatedEntityId", sql.UniqueIdentifier, relatedEntityId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .input("uploadedByObjectId", sql.NVarChar(100), uploadedByObjectId)
      .input("uploadedByDisplayName", sql.NVarChar(200), uploadedByDisplayName)
      .input("uploadedByEmail", sql.NVarChar(320), uploadedByEmail)
      .input("description", sql.NVarChar(500), description)
      .input("metadataJson", sql.NVarChar(sql.MAX), metadataJson)
      .input("employmentForm", sql.Bit, Boolean(formContext))
      .input("verifiedEmployee", sql.Bit, Boolean(formContext || screeningContext?.employeeId))
      .input("screeningApplication", sql.UniqueIdentifier, screeningContext?.applicationId ?? null)
      .input("screeningKey", sql.NVarChar(100), screeningContext?.uploadKey ?? null)
      .input("screeningLock", sql.NVarChar(255), screeningContext ? `screening:${(screeningContext.applicationId ?? screeningContext.employeeId)!.toLowerCase()}:${screeningContext.uploadKey}` : null)
      .input("selfForm", sql.Bit, Boolean(formContext && request.query.get("employeeId") === "me"))
      .query<DocumentRow>(`
        SET XACT_ABORT ON;
        BEGIN TRY BEGIN TRANSACTION;
        IF @employmentForm=1 AND @documentType=N'employment_i9'
          AND NOT EXISTS(SELECT 1 FROM dbo.stage2_i9_collection_policy WITH(HOLDLOCK) WHERE id=1 AND collect_i9=1)
          THROW 58016,'I-9 collection is off.',1;
        IF @employmentForm=1 AND @documentType=N'employment_w4'
          AND NOT EXISTS(SELECT 1 FROM dbo.stage2_w4_collection_policy WITH(HOLDLOCK) WHERE id=1 AND collect_w4=1)
          THROW 58017,'W-4 collection is off.',1;
        IF @verifiedEmployee=1 AND NOT EXISTS(SELECT 1 FROM dbo.employees WITH(UPDLOCK,HOLDLOCK) WHERE employee_id=@employeeId)
          THROW 58010,'Employment form employee is unavailable.',1;
        IF @screeningKey IS NOT NULL
        BEGIN
          IF @screeningApplication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.employment_applications WITH(UPDLOCK,HOLDLOCK) WHERE application_id=@screeningApplication)
            THROW 58014,'Screening application is unavailable.',1;
          IF @employeeId IS NOT NULL AND @screeningApplication IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.employees WHERE employee_id=@employeeId AND application_id=@screeningApplication)
            THROW 58015,'Screening employee link changed.',1;
          DECLARE @screeningLockResult int;
          EXEC @screeningLockResult=sys.sp_getapplock @Resource=@screeningLock,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
          IF @screeningLockResult<0 THROW 58012,'Screening upload is busy. Reload before retrying.',1;
          IF EXISTS(SELECT 1 FROM dbo.document_metadata WHERE (employee_id=@employeeId OR (employee_id IS NULL AND related_entity_type=N'employment_application' AND related_entity_id=@screeningApplication)) AND document_type=N'background_check'
            AND JSON_VALUE(CASE WHEN ISJSON(metadata_json)=1 THEN metadata_json ELSE N'{}' END,'$.screening.uploadKey')=@screeningKey)
            THROW 58013,'Screening evidence already exists. Reload before retrying.',1;
        END;
        IF @selfForm=1 AND ((SELECT COUNT(*) FROM dbo.employees WITH(UPDLOCK,HOLDLOCK) WHERE entra_object_id=@uploadedByObjectId AND employment_status IN(N'active',N'onboarding',N'on_leave'))<>1
          OR NOT EXISTS(SELECT 1 FROM dbo.employees WITH(UPDLOCK,HOLDLOCK) WHERE employee_id=@employeeId AND entra_object_id=@uploadedByObjectId AND employment_status IN(N'active',N'onboarding',N'on_leave')))
          THROW 58011,'Employment form account binding changed.',1;
        INSERT INTO dbo.document_metadata (
          document_id,
          document_type,
          workflow_area,
          storage_zone,
          container_name,
          blob_name,
          original_file_name,
          content_type,
          file_size_bytes,
          status,
          related_entity_type,
          related_entity_id,
          employee_id,
          client_id,
          uploaded_by_object_id,
          uploaded_by_display_name,
          uploaded_by_email,
          description,
          metadata_json
        )
        OUTPUT
          INSERTED.document_id,
          INSERTED.document_type,
          INSERTED.workflow_area,
          INSERTED.container_name,
          INSERTED.blob_name,
          INSERTED.original_file_name,
          INSERTED.content_type,
          INSERTED.file_size_bytes,
          INSERTED.status,
          INSERTED.related_entity_type,
          INSERTED.related_entity_id,
          INSERTED.employee_id,
          INSERTED.client_id,
          INSERTED.uploaded_by_object_id,
          INSERTED.uploaded_by_display_name,
          INSERTED.uploaded_by_email,
          INSERTED.uploaded_at_utc,
          INSERTED.description,
          INSERTED.metadata_json,
          INSERTED.created_at_utc,
          INSERTED.updated_at_utc
        VALUES (
          @documentId,
          @documentType,
          @workflowArea,
          @storageZone,
          @containerName,
          @blobName,
          @originalFileName,
          @contentType,
          @fileSizeBytes,
          N'pending_scan',
          @relatedEntityType,
          @relatedEntityId,
          @employeeId,
          @clientId,
          @uploadedByObjectId,
          @uploadedByDisplayName,
          @uploadedByEmail,
          @description,
          @metadataJson
        );
        INSERT dbo.staff_document_scans(document_id,intake_blob,intake_etag,destination_container,destination_blob,file_size_bytes,sha256)
          VALUES(@documentId,@blobName,@intakeEtag,@destinationContainer,@destinationBlob,@fileSizeBytes,@sha256);
        COMMIT; END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH;
      `);

    return json(201, {
      ok: true,
      document: mapDocument(result.recordset[0]),
      storage: {
        containerName: "staff-document-quarantine",
        blobName,
      },
      auth: {
        requiredRole: roleResult.matchedRole,
        requiredRoles: roleResult.requiredRoles,
        roles: roleResult.roles,
      },
    });
  } catch (error) {
    if (metadataAttempted && uploadIdentity) {
      try {
        const receipt = await readDocumentUploadReceipt(await getSqlPool(), uploadIdentity);
        if (receipt) return json(201, { ok: true, document: mapDocument(receipt), reconciled: true });
      } catch { /* Unknown completion: preserve intake bytes for reconciliation. */ }
      context.warn("Document upload completion is uncertain; intake retained for reconciliation.");
    } else if (uploadedBlobClient && uploadEtag) {
      try { await uploadedBlobClient.deleteIfExists({ conditions: { ifMatch: uploadEtag } }); }
      catch { context.warn("Unreferenced document intake retained after conditional cleanup failed."); }
    }

    const message =
      error instanceof Error ? error.message : "Unknown document upload error.";

    const status =
      message.includes("required") ||
      message.includes("must be")
        ? 400
        : 500;

    context.error("Document upload failed.");

    return json(status, {
      ok: false,
      error: "Document upload failed.",
      ...(status === 400 ? { detail: message } : {}),
    });
  }
}

async function listDocuments(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Processing protected GET /api/documents request.");

  const roleResult = await requireAnyAppRole(request, documentRoles);

  if (!roleResult.ok) {
    return json(roleResult.status, {
      error: roleResult.error,
    });
  }

  try {
    const topRaw = request.query.get("top");
    const top = topRaw ? Number.parseInt(topRaw, 10) : 50;

    if (!Number.isInteger(top) || top < 1 || top > 100) {
      return json(400, {
        ok: false,
        error: "top must be an integer from 1 to 100.",
      });
    }

    const filters = createProtectedDocumentFilters(["status <> N'deleted'"]);
    const dbRequest = (await getSqlPool()).request();
    filters.push(bindDocumentAccess(dbRequest, roleResult.roles));

    dbRequest.input(
      "storageZone",
      sql.NVarChar(50),
      protectedDocumentStorageZone
    );
    dbRequest.input("top", sql.Int, top);

    const documentType = getOptionalString(
      request.query.get("documentType"),
      "documentType",
      50
    );

    if (documentType) {
      if (!(documentType in documentTypeConfig)) {
        return json(400, {
          ok: false,
          error: `documentType must be one of: ${Object.keys(documentTypeConfig).join(", ")}.`,
        });
      }

      dbRequest.input("documentType", sql.NVarChar(50), documentType);
      filters.push("document_type = @documentType");
    }

    const workflowArea = getOptionalString(
      request.query.get("workflowArea"),
      "workflowArea",
      50
    );

    if (workflowArea) {
      dbRequest.input("workflowArea", sql.NVarChar(50), workflowArea);
      filters.push("workflow_area = @workflowArea");
    }

    const status = getOptionalString(request.query.get("status"), "status", 50);

    if (status) {
      dbRequest.input("status", sql.NVarChar(50), status);
      filters.push("status = @status");
    }

    const relatedEntityType = getOptionalString(
      request.query.get("relatedEntityType"),
      "relatedEntityType",
      100
    );

    if (relatedEntityType) {
      dbRequest.input("relatedEntityType", sql.NVarChar(100), relatedEntityType);
      filters.push("related_entity_type = @relatedEntityType");
    }

    const relatedEntityId = getOptionalUuid(
      request.query.get("relatedEntityId"),
      "relatedEntityId"
    );

    if (relatedEntityId) {
      dbRequest.input("relatedEntityId", sql.UniqueIdentifier, relatedEntityId);
      filters.push("related_entity_id = @relatedEntityId");
    }

    const employeeId = getOptionalUuid(request.query.get("employeeId"), "employeeId");

    if (employeeId) {
      dbRequest.input("employeeId", sql.UniqueIdentifier, employeeId);
      filters.push("employee_id = @employeeId");
    }

    const clientId = getOptionalUuid(request.query.get("clientId"), "clientId");

    if (clientId) {
      dbRequest.input("clientId", sql.UniqueIdentifier, clientId);
      filters.push("client_id = @clientId");
    }

    const result = await dbRequest.query<DocumentRow>(`
      SELECT TOP (@top)
        document_id,
        document_type,
        workflow_area,
        container_name,
        blob_name,
        original_file_name,
        content_type,
        file_size_bytes,
        status,
        related_entity_type,
        related_entity_id,
        employee_id,
        client_id,
        uploaded_by_object_id,
        uploaded_by_display_name,
        uploaded_by_email,
        uploaded_at_utc,
        description,
        metadata_json,
        created_at_utc,
        updated_at_utc
      FROM dbo.document_metadata
      WHERE ${filters.join(" AND ")}
      ORDER BY uploaded_at_utc DESC;
    `);

    const documents = result.recordset.map(mapDocument);
    await auditDocumentRead(await getSqlPool(), {
      actorId: typeof roleResult.claims.oid === "string" ? roleResult.claims.oid : "",
      requestId: context.invocationId, operation: "document_list",
      documentIds: documents.map(document => document.documentId),
    });

    return json(200, {
      ok: true,
      count: documents.length,
      documents,
      auth: {
        requiredRole: roleResult.matchedRole,
        requiredRoles: roleResult.requiredRoles,
        roles: roleResult.roles,
      },
    });
  } catch {
    context.error("Document list failed.");

    return json(500, {
      ok: false,
      error: "Document list failed.",
    });
  }
}

async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of readableStream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }

    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    chunks.push(Buffer.from(chunk as Uint8Array));
  }

  return Buffer.concat(chunks);
}

function getRouteDocumentId(request: HttpRequest) {
  const documentId = request.params.documentId;

  if (!documentId || !uuidPattern.test(documentId)) {
    throw new Error("documentId must be a valid GUID.");
  }

  return documentId;
}

function getDownloadFileName(fileName: string) {
  return sanitizeFileName(fileName).replace(/"/g, "_");
}

function isBlobNotFoundError(error: unknown) {
  const maybeError = error as {
    statusCode?: unknown;
    code?: unknown;
    details?: {
      errorCode?: unknown;
    };
  };

  return (
    maybeError.statusCode === 404 ||
    maybeError.code === "BlobNotFound" ||
    maybeError.details?.errorCode === "BlobNotFound"
  );
}

async function getDocumentById(documentId: string, roles: readonly string[], formContext?: VerifiedDocumentReadContext) {
  const pool = await getSqlPool();
  const dbRequest = pool.request();
  const accessPredicate = formContext ? "(employee_id=@formEmployee OR (employee_id IS NULL AND related_entity_type=N'employment_application' AND related_entity_id=@formApplication)) AND document_type=@formKind" : bindDocumentAccess(dbRequest, roles);
  if (formContext) dbRequest.input("formEmployee",sql.UniqueIdentifier,formContext.employeeId).input("formApplication",sql.UniqueIdentifier,formContext.applicationId ?? null).input("formKind",sql.NVarChar(50),formContext.kind);
  const result = await dbRequest
    .input("documentId", sql.UniqueIdentifier, documentId)
    .input(
      "storageZone",
      sql.NVarChar(50),
      protectedDocumentStorageZone
    )
    .query<DocumentRow>(`
      SELECT TOP (1)
        document_id,
        document_type,
        workflow_area,
        container_name,
        blob_name,
        original_file_name,
        content_type,
        file_size_bytes,
        status,
        related_entity_type,
        related_entity_id,
        employee_id,
        client_id,
        uploaded_by_object_id,
        uploaded_by_display_name,
        uploaded_by_email,
        uploaded_at_utc,
        description,
        metadata_json,
        created_at_utc,
        updated_at_utc
      FROM dbo.document_metadata
      WHERE ${availableDocumentIdentityPredicate} AND (${accessPredicate});
    `);

  return result.recordset[0] ?? null;
}

export async function downloadDocument(
  request: HttpRequest,
  context: InvocationContext,
  formContext?: VerifiedDocumentReadContext
): Promise<HttpResponseInit> {
  context.log("Processing protected GET /api/documents/{documentId}/download request.");

  const roleResult = formContext?.auth ?? await requireAnyAppRole(request, documentRoles);

  if (!roleResult.ok) {
    return json(roleResult.status, {
      error: roleResult.error,
    });
  }

  let documentId: string;

  try {
    documentId = formContext?.documentId ?? getRouteDocumentId(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid document ID.";

    return json(400, {
      ok: false,
      error: message,
    });
  }

  try {
    const document = await getDocumentById(documentId, roleResult.roles, formContext);

    if (!document) {
      return json(404, {
        ok: false,
        error: "Document was not found.",
      });
    }

    const configuredContainers = getConfiguredContainerNames();

    if (
      !configuredContainers.has(document.container_name)
    ) {
      context.error("Document references an unconfigured storage container.");

      return json(500, {
        ok: false,
        error: "Document storage container is not configured.",
      });
    }

    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(
      document.container_name
    );
    const blobClient = containerClient.getBlockBlobClient(document.blob_name);

    let blobDownload;

    try {
      blobDownload = await blobClient.download(0);
    } catch (error) {
      if (isBlobNotFoundError(error)) {
        return json(404, {
          ok: false,
          error: "Document metadata exists, but the blob was not found.",
        });
      }

      throw error;
    }

    if (!blobDownload.readableStreamBody) {
      return json(500, {
        ok: false,
        error: "Document blob could not be read.",
      });
    }

    const fileBuffer = await streamToBuffer(blobDownload.readableStreamBody);
    await auditDocumentRead(await getSqlPool(), {
      actorId: typeof roleResult.claims.oid === "string" ? roleResult.claims.oid : "",
      requestId: context.invocationId, operation: "document_download", documentIds: [document.document_id],
    });
    const fileName = getDownloadFileName(document.original_file_name);
    const contentType =
      document.content_type?.trim() || "application/octet-stream";

    return {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileBuffer.length),
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
        "X-Workforce-Document-Id": document.document_id,
      },
      body: fileBuffer,
    };
  } catch (error) {
    context.error("Document download failed.");

    return json(500, {
      ok: false,
      error: "Document download failed.",
    });
  }
}



const allowedDocumentStatuses = [
  "uploaded",
  "archived",
] as const;

type DocumentStatus = (typeof allowedDocumentStatuses)[number];

function getRequiredDocumentStatus(value: unknown): DocumentStatus {
  const status = getRequiredString(value, "status", 50);

  if (!allowedDocumentStatuses.includes(status as DocumentStatus)) {
    throw new Error(
      `status must be one of: ${allowedDocumentStatuses.join(", ")}.`
    );
  }

  return status as DocumentStatus;
}

async function updateDocumentStatus(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Processing protected POST /api/documents/{documentId}/status request.");

  const roleResult = await requireAnyAppRole(request, documentRoles);

  if (!roleResult.ok) {
    return json(roleResult.status, {
      error: roleResult.error,
    });
  }

  let documentId: string;
  let body: Record<string, unknown>;
  let nextStatus: DocumentStatus;

  try {
    documentId = getRouteDocumentId(request);
    body = await readJsonObject(request);
    nextStatus = getRequiredDocumentStatus(body.status);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid document status request.";

    return json(400, {
      ok: false,
      error: message,
    });
  }

  try {
    const pool = await getSqlPool();
    const dbRequest = pool.request();
    const accessPredicate = bindDocumentAccess(dbRequest, roleResult.roles);
    const result = await dbRequest
      .input("documentId", sql.UniqueIdentifier, documentId)
      .input("status", sql.NVarChar(50), nextStatus)
      .input(
        "storageZone",
        sql.NVarChar(50),
        protectedDocumentStorageZone
      )
      .query<DocumentRow>(`
        UPDATE dbo.document_metadata
        SET
          status = @status,
          updated_at_utc = SYSUTCDATETIME()
        OUTPUT
          INSERTED.document_id,
          INSERTED.document_type,
          INSERTED.workflow_area,
          INSERTED.container_name,
          INSERTED.blob_name,
          INSERTED.original_file_name,
          INSERTED.content_type,
          INSERTED.file_size_bytes,
          INSERTED.status,
          INSERTED.related_entity_type,
          INSERTED.related_entity_id,
          INSERTED.employee_id,
          INSERTED.client_id,
          INSERTED.uploaded_by_object_id,
          INSERTED.uploaded_by_display_name,
          INSERTED.uploaded_by_email,
          INSERTED.uploaded_at_utc,
          INSERTED.description,
          INSERTED.metadata_json,
          INSERTED.created_at_utc,
          INSERTED.updated_at_utc
        WHERE ${availableDocumentIdentityPredicate} AND (${accessPredicate});
      `);

    const updatedDocument = result.recordset[0] ?? null;

    if (!updatedDocument) {
      return json(404, {
        ok: false,
        error: "Document was not found.",
      });
    }

    return json(200, {
      ok: true,
      document: mapDocument(updatedDocument),
      auth: {
        requiredRoles: [...documentRoles],
        roles: roleResult.roles,
      },
    });
  } catch (error) {
    context.error("Document status update failed.");

    return json(500, {
      ok: false,
      error: "Document status update failed.",
    });
  }
}


const searchDocuments = createDocumentSearchHandler({
  authorize: requireAnyAppRole,
  containers: () => [...getConfiguredContainerNames()],
  query: async plan => queryDocumentSearch(await getSqlPool(), plan),
  audit: async event => auditDocumentRead(await getSqlPool(), event),
});

const listStaffUploadStatus=createStaffUploadStatusHandler({
  authorize:async request=>{
    const auth=await requireAnyAppRole(request,documentRoles);
    return auth.ok?{ok:true,roles:auth.roles,actorId:String(auth.claims.oid??"")}:auth;
  },
  read:async({roles,actorId,requestId,documentId})=>{
    const pool=await getSqlPool(),query=pool.request();
    if(documentId)query.input("statusDocumentId",sql.UniqueIdentifier,documentId);
    const scope=bindDocumentAccess(query,roles);
    const result=await query.query<{documentId:string;fileName:string;scanStatus:string;uploadedAtUtc:Date}>(`
      SELECT TOP(50) d.document_id AS documentId,d.original_file_name AS fileName,
        s.scan_status AS scanStatus,d.uploaded_at_utc AS uploadedAtUtc
      FROM dbo.document_metadata d JOIN dbo.staff_document_scans s ON s.document_id=d.document_id
      WHERE ${scope} AND d.status<>N'deleted' ${documentId?'AND d.document_id=@statusDocumentId':''}
      ORDER BY d.uploaded_at_utc DESC,d.document_id;`);
    await auditDocumentRead(pool,{actorId,requestId,operation:"document_list",documentIds:result.recordset.map(row=>row.documentId)});
    return result.recordset;
  },
});

app.http("documents", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "documents",
  handler: async (request, context) => {
    if (request.method === "GET") {
      if(request.query.get("view")==="intake")return listStaffUploadStatus(request,context);
      return listDocuments(request, context);
    }

    if (request.method === "POST") {
      if (request.query.get("view") === "search") return searchDocuments(request, context);
      return uploadDocument(request, context);
    }

    return json(405, {
      ok: false,
      error: "Method not allowed.",
    });
  },
});

app.http("downloadDocument", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "documents/{documentId}/download",
  handler: downloadDocument,
});

app.http("updateDocumentStatus", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "documents/{documentId}/status",
  handler: updateDocumentStatus,
});
