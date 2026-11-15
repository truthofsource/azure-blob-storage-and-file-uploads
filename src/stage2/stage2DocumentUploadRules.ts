import type {
  Stage2DocumentContentType,
} from "../contracts/publicStage2DocumentUpload.ts";

export function isStage2DocumentUploadEnabled(
  value: string | undefined
) {
  return (
    value?.trim().toLowerCase() ===
    "true"
  );
}

export const supportedStage2DocumentItemCodes =
  [
    "certification_training_documents",
    "government_issued_photo_id",
    "employment_i9_upload",
    "employment_w4_upload",
  ] as const;

type SupportedStage2DocumentItemCode =
  typeof supportedStage2DocumentItemCodes[number];

type Stage2DocumentMetadataType =
  | "employment_application"
  | "government_id"
  | "stage2_i9"
  | "stage2_w4";

type Stage2DocumentUploadDefinition = {
  allowedContentTypes:
    readonly Stage2DocumentContentType[];
  documentType:
    Stage2DocumentMetadataType;
  description: string;
};

const stage2DocumentUploadDefinitions:
  Record<
    SupportedStage2DocumentItemCode,
    Stage2DocumentUploadDefinition
  > = {
    certification_training_documents: {
      allowedContentTypes: [
        "application/pdf",
        "image/jpeg",
        "image/png",
      ],
      documentType:
        "employment_application",
      description:
        "Stage 2 applicant certification or training document.",
    },
    government_issued_photo_id: {
      allowedContentTypes: [
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/heif",
      ],
      documentType: "government_id",
      description:
        "Stage 2 applicant government-issued photo ID.",
    },
    employment_i9_upload: {
      allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
      documentType: "stage2_i9",
      description: "Applicant-provided Form I-9 for protected staff review.",
    },
    employment_w4_upload: {
      allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
      documentType: "stage2_w4",
      description: "Applicant-provided Form W-4 for protected Payroll review.",
    },
  };

export const stage2DocumentMutablePacketStatuses =
  [
    "in_progress",
    "changes_requested",
  ] as const;

export const stage2DocumentUploadableItemStatuses =
  [
    "pending",
    "in_progress",
    "changes_requested",
    "submitted",
  ] as const;

export type Stage2DocumentUploadDecision =
  | {
      ok: true;
      operation:
        | "create"
        | "replace";
      documentType:
        Stage2DocumentMetadataType;
      description: string;
    }
  | {
      ok: false;
      reason:
        | "packet_not_mutable"
        | "item_not_document"
        | "unsupported_document_item"
        | "item_not_mutable"
        | "accepted_document_exists"
        | "unsupported_document_content_type";
    };

export function getStage2DocumentUploadDecision(
  packetStatus: string,
  itemCode: string,
  itemCategory: string,
  itemStatus: string,
  contentType:
    Stage2DocumentContentType,
  existingReplaceableDocumentCount:
    number,
  acceptedDocumentExists: boolean
): Stage2DocumentUploadDecision {
  if (
    !(
      stage2DocumentMutablePacketStatuses as
        readonly string[]
    ).includes(packetStatus)
  ) {
    return {
      ok: false,
      reason: "packet_not_mutable",
    };
  }

  if (itemCategory !== "document") {
    return {
      ok: false,
      reason: "item_not_document",
    };
  }

  if (
    !(
      supportedStage2DocumentItemCodes as
        readonly string[]
    ).includes(itemCode)
  ) {
    return {
      ok: false,
      reason:
        "unsupported_document_item",
    };
  }

  const definition =
    stage2DocumentUploadDefinitions[
      itemCode as
        SupportedStage2DocumentItemCode
    ];

  if (
    !(
      stage2DocumentUploadableItemStatuses as
        readonly string[]
    ).includes(itemStatus)
  ) {
    return {
      ok: false,
      reason: "item_not_mutable",
    };
  }

  if (acceptedDocumentExists) {
    return {
      ok: false,
      reason:
        "accepted_document_exists",
    };
  }

  if (
    !(
      definition.allowedContentTypes as
        readonly Stage2DocumentContentType[]
    ).includes(contentType)
  ) {
    return {
      ok: false,
      reason:
        "unsupported_document_content_type",
    };
  }

  return {
    ok: true,
    operation:
      existingReplaceableDocumentCount >
      0
        ? "replace"
        : "create",
    documentType:
      definition.documentType,
    description:
      definition.description,
  };
}
