import assert from "node:assert/strict";
import test from "node:test";
import {
  getStage2DocumentUploadDecision,
  isStage2DocumentUploadEnabled,
  supportedStage2DocumentItemCodes,
} from "./stage2DocumentUploadRules.ts";

const certificationDocumentItemCode =
  "certification_training_documents";

const governmentIdDocumentItemCode =
  "government_issued_photo_id";

test(
  "defines exactly the approved Stage 2 document items",
  () => {
    assert.deepEqual(
      supportedStage2DocumentItemCodes,
      [
        "certification_training_documents",
        "government_issued_photo_id",
        "employment_i9_upload",
        "employment_w4_upload",
      ]
    );
  }
);

test(
  "enables document upload only for the explicit true setting",
  () => {
    assert.equal(
      isStage2DocumentUploadEnabled(
        "true"
      ),
      true
    );

    assert.equal(
      isStage2DocumentUploadEnabled(
        " TRUE "
      ),
      true
    );

    assert.equal(
      isStage2DocumentUploadEnabled(
        "false"
      ),
      false
    );

    assert.equal(
      isStage2DocumentUploadEnabled(
        "1"
      ),
      false
    );

    assert.equal(
      isStage2DocumentUploadEnabled(
        undefined
      ),
      false
    );
  }
);

test(
  "allows a first certification document upload and preserves metadata mapping",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "in_progress",
        certificationDocumentItemCode,
        "document",
        "pending",
        "application/pdf",
        0,
        false
      ),
      {
        ok: true,
        operation: "create",
        documentType:
          "employment_application",
        description:
          "Stage 2 applicant certification or training document.",
      }
    );
  }
);

test(
  "preserves PDF JPEG and PNG support for certification documents",
  () => {
    for (
      const contentType of [
        "application/pdf",
        "image/jpeg",
        "image/png",
      ] as const
    ) {
      const decision =
        getStage2DocumentUploadDecision(
          "in_progress",
          certificationDocumentItemCode,
          "document",
          "pending",
          contentType,
          0,
          false
        );

      assert.equal(
        decision.ok,
        true
      );
    }
  }
);

test(
  "allows government ID JPEG and PNG uploads with government_id metadata",
  () => {
    for (
      const contentType of [
        "image/jpeg",
        "image/png",
      ] as const
    ) {
      assert.deepEqual(
        getStage2DocumentUploadDecision(
          "in_progress",
          governmentIdDocumentItemCode,
          "document",
          "pending",
          contentType,
          0,
          false
        ),
        {
          ok: true,
          operation: "create",
          documentType:
            "government_id",
          description:
            "Stage 2 applicant government-issued photo ID.",
        }
      );
    }
  }
);

test("optional Stage 2 employment forms use distinct protected document types", () => {
  for (const [itemCode, documentType] of [
    ["employment_i9_upload", "stage2_i9"],
    ["employment_w4_upload", "stage2_w4"],
  ] as const) {
    const decision = getStage2DocumentUploadDecision(
      "in_progress", itemCode, "document", "pending", "application/pdf", 0, false
    );
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.documentType, documentType);
  }
});

test(
  "rejects PDF for government ID",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "in_progress",
        governmentIdDocumentItemCode,
        "document",
        "pending",
        "application/pdf",
        0,
        false
      ),
      {
        ok: false,
        reason:
          "unsupported_document_content_type",
      }
    );
  }
);

test(
  "allows replacement of submitted or rejected certification documents",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "changes_requested",
        certificationDocumentItemCode,
        "document",
        "changes_requested",
        "application/pdf",
        1,
        false
      ),
      {
        ok: true,
        operation: "replace",
        documentType:
          "employment_application",
        description:
          "Stage 2 applicant certification or training document.",
      }
    );
  }
);

test(
  "allows replacement of a mutable government ID image",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "changes_requested",
        governmentIdDocumentItemCode,
        "document",
        "submitted",
        "image/jpeg",
        1,
        false
      ),
      {
        ok: true,
        operation: "replace",
        documentType:
          "government_id",
        description:
          "Stage 2 applicant government-issued photo ID.",
      }
    );
  }
);

test(
  "rejects nonmutable packet states",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "submitted",
        certificationDocumentItemCode,
        "document",
        "submitted",
        "application/pdf",
        0,
        false
      ),
      {
        ok: false,
        reason:
          "packet_not_mutable",
      }
    );
  }
);

test(
  "rejects non-document packet items",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "in_progress",
        certificationDocumentItemCode,
        "acknowledgment",
        "pending",
        "application/pdf",
        0,
        false
      ),
      {
        ok: false,
        reason:
          "item_not_document",
      }
    );
  }
);

test(
  "rejects an undefined future document item",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "in_progress",
        "future_identity_document",
        "document",
        "pending",
        "image/jpeg",
        0,
        false
      ),
      {
        ok: false,
        reason:
          "unsupported_document_item",
      }
    );
  }
);

test(
  "rejects reviewer-controlled item states",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "changes_requested",
        certificationDocumentItemCode,
        "document",
        "accepted",
        "application/pdf",
        0,
        false
      ),
      {
        ok: false,
        reason:
          "item_not_mutable",
      }
    );
  }
);

test(
  "rejects replacement of an accepted certification document",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "changes_requested",
        certificationDocumentItemCode,
        "document",
        "changes_requested",
        "application/pdf",
        0,
        true
      ),
      {
        ok: false,
        reason:
          "accepted_document_exists",
      }
    );
  }
);

test(
  "rejects replacement of an accepted government ID",
  () => {
    assert.deepEqual(
      getStage2DocumentUploadDecision(
        "changes_requested",
        governmentIdDocumentItemCode,
        "document",
        "changes_requested",
        "image/png",
        0,
        true
      ),
      {
        ok: false,
        reason:
          "accepted_document_exists",
      }
    );
  }
);
