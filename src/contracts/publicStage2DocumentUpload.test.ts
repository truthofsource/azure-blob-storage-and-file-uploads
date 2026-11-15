import assert from "node:assert/strict";
import test from "node:test";
import {
  isStage2DocumentJsonContentType,
  maximumStage2DocumentBytes,
  parsePublicStage2DocumentUpload,
  validateStage2DocumentContent,
} from "./publicStage2DocumentUpload.ts";

const packetItemId =
  "123e4567-e89b-42d3-a456-426614174000";

test("long JPEG names preserve their actual extension within the metadata limit", () => {
  for (const extension of [".jpg", ".JPEG"]) {
    const parsed = parsePublicStage2DocumentUpload({ packetItemId, originalFileName: "synthetic-".repeat(20) + extension,
      contentType: "image/jpeg", contentBase64: makeJpegBase64() });
    assert.equal(parsed.originalFileName.length, 160);
    assert.ok(parsed.originalFileName.endsWith(extension));
    assert.equal(validateStage2DocumentContent(parsed).contentType, "image/jpeg");
  }
});
test("shortening a long name cannot hide its unsupported final extension", () => {
  const parsed = parsePublicStage2DocumentUpload({ packetItemId, originalFileName: "a".repeat(156) + ".jpg" + "b".repeat(20) + ".exe",
    contentType: "image/jpeg", contentBase64: makeJpegBase64() });
  assert.ok(parsed.originalFileName.endsWith(".exe"));
  assert.throws(() => validateStage2DocumentContent(parsed), /extension does not match/);
});

function makePdfBase64() {
  return Buffer.from(
    "%PDF-1.7\nSynthetic test document",
    "ascii"
  ).toString("base64");
}

function makeJpegBase64() {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
  ]).toString("base64");
}

function makePngBase64() {
  return Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
  ]).toString("base64");
}

test(
  "parses and validates a PDF upload",
  () => {
    const parsed =
      parsePublicStage2DocumentUpload({
        packetItemId,
        originalFileName:
          "training certificate.pdf",
        contentType:
          "application/pdf",
        contentBase64:
          makePdfBase64(),
      });

    const validated =
      validateStage2DocumentContent(
        parsed
      );

    assert.equal(
      validated.fileExtension,
      ".pdf"
    );

    assert.equal(
      validated.contentType,
      "application/pdf"
    );
  }
);

test(
  "parses and validates JPEG and PNG uploads",
  () => {
    const jpeg =
      validateStage2DocumentContent(
        parsePublicStage2DocumentUpload({
          packetItemId,
          originalFileName:
            "certificate.jpeg",
          contentType: "image/jpeg",
          contentBase64:
            makeJpegBase64(),
        })
      );

    const png =
      validateStage2DocumentContent(
        parsePublicStage2DocumentUpload({
          packetItemId,
          originalFileName:
            "certificate.png",
          contentType: "image/png",
          contentBase64:
            makePngBase64(),
        })
      );

    assert.equal(
      jpeg.fileExtension,
      ".jpg"
    );

    assert.equal(
      png.fileExtension,
      ".png"
    );
  }
);

test(
  "rejects unsupported fields",
  () => {
    assert.throws(
      () =>
        parsePublicStage2DocumentUpload({
          packetItemId,
          originalFileName:
            "certificate.pdf",
          contentType:
            "application/pdf",
          contentBase64:
            makePdfBase64(),
          documentType:
            "background_check",
        }),
      /Unsupported field/
    );
  }
);

test(
  "rejects invalid packet-item IDs",
  () => {
    assert.throws(
      () =>
        parsePublicStage2DocumentUpload({
          packetItemId:
            "not-a-uuid",
          originalFileName:
            "certificate.pdf",
          contentType:
            "application/pdf",
          contentBase64:
            makePdfBase64(),
        }),
      /valid UUID/
    );
  }
);

test(
  "rejects unsupported content types",
  () => {
    assert.throws(
      () =>
        parsePublicStage2DocumentUpload({
          packetItemId,
          originalFileName:
            "certificate.exe",
          contentType:
            "application/octet-stream",
          contentBase64:
            makePdfBase64(),
        }),
      /contentType/
    );
  }
);

test(
  "rejects extension and content-type mismatches",
  () => {
    const parsed =
      parsePublicStage2DocumentUpload({
        packetItemId,
        originalFileName:
          "certificate.png",
        contentType:
          "application/pdf",
        contentBase64:
          makePdfBase64(),
      });

    assert.throws(
      () =>
        validateStage2DocumentContent(
          parsed
        ),
      /extension/
    );
  }
);

test(
  "rejects file-signature mismatches",
  () => {
    const parsed =
      parsePublicStage2DocumentUpload({
        packetItemId,
        originalFileName:
          "certificate.pdf",
        contentType:
          "application/pdf",
        contentBase64:
          Buffer.from(
            "not a PDF",
            "utf8"
          ).toString("base64"),
      });

    assert.throws(
      () =>
        validateStage2DocumentContent(
          parsed
        ),
      /signature/
    );
  }
);

test(
  "rejects noncanonical base64",
  () => {
    assert.throws(
      () =>
        parsePublicStage2DocumentUpload({
          packetItemId,
          originalFileName:
            "certificate.pdf",
          contentType:
            "application/pdf",
          contentBase64:
            "%%%not-base64%%%",
        }),
      /canonical base64/
    );
  }
);

test(
  "rejects files above the binary size limit",
  () => {
    const oversized =
      Buffer.alloc(
        maximumStage2DocumentBytes + 1,
        0x41
      ).toString("base64");

    assert.throws(
      () =>
        parsePublicStage2DocumentUpload({
          packetItemId,
          originalFileName:
            "certificate.pdf",
          contentType:
            "application/pdf",
          contentBase64: oversized,
        }),
      /characters or fewer|bytes/
    );
  }
);

test(
  "removes client path components from file names",
  () => {
    const parsed =
      parsePublicStage2DocumentUpload({
        packetItemId,
        originalFileName:
          "C:\\fakepath\\certificate.pdf",
        contentType:
          "application/pdf",
        contentBase64:
          makePdfBase64(),
      });

    assert.equal(
      parsed.originalFileName,
      "certificate.pdf"
    );
  }
);

test(
  "accepts only the exact JSON media type",
  () => {
    assert.equal(
      isStage2DocumentJsonContentType(
        "application/json"
      ),
      true
    );

    assert.equal(
      isStage2DocumentJsonContentType(
        "application/json; charset=utf-8"
      ),
      true
    );

    assert.equal(
      isStage2DocumentJsonContentType(
        "APPLICATION/JSON"
      ),
      true
    );

    assert.equal(
      isStage2DocumentJsonContentType(
        "text/application/json"
      ),
      false
    );

    assert.equal(
      isStage2DocumentJsonContentType(
        "application/json-malformed"
      ),
      false
    );

    assert.equal(
      isStage2DocumentJsonContentType(
        null
      ),
      false
    );
  }
);
