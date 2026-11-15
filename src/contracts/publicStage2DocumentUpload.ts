export const maximumStage2DocumentBytes =
  5 * 1024 * 1024;

export const maximumStage2DocumentRequestBytes =
  8 * 1024 * 1024;

export const allowedStage2DocumentContentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
] as const;

export type Stage2DocumentContentType =
  typeof allowedStage2DocumentContentTypes[number];

export function isStage2DocumentJsonContentType(
  value: string | null
) {
  if (!value) {
    return false;
  }

  const mediaType =
    value
      .split(";", 1)[0]
      ?.trim()
      .toLowerCase();

  return mediaType ===
    "application/json";
}

export type PublicStage2DocumentUploadRequest = {
  packetItemId: string;
  originalFileName: string;
  contentType: Stage2DocumentContentType;
  contentBase64: string;
};

export type ValidatedStage2DocumentUpload = {
  packetItemId: string;
  originalFileName: string;
  contentType: Stage2DocumentContentType;
  fileExtension: ".pdf" | ".jpg" | ".png" | ".heic";
  fileBuffer: Buffer;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const maximumBase64Length =
  Math.ceil(
    maximumStage2DocumentBytes / 3
  ) * 4;

const allowedFields = new Set([
  "packetItemId",
  "originalFileName",
  "contentType",
  "contentBase64",
]);

function isHeicContainer(bytes: Buffer) {
  if (bytes.length < 24 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  const size = bytes.readUInt32BE(0);
  if (size < 24 || size > bytes.length || size > 4096 || size % 4 !== 0) return false;
  const brands = [bytes.toString("ascii", 8, 12)];
  for (let offset = 16; offset < size; offset += 4) brands.push(bytes.toString("ascii", offset, offset + 4));
  if (brands.some(brand => ["avif", "avis", "msf1", "hevc", "hevx"].includes(brand))) return false;
  return ["heic", "heix", "mif1"].includes(brands[0]) && brands.some(brand => ["heic", "heix"].includes(brand));
}
const heicDefinition = { extensions: [".heic", ".heif"], outputExtension: ".heic", signatureMatches: isHeicContainer } as const;
const contentTypeDefinitions = {
  "image/heic": heicDefinition,
  "image/heif": heicDefinition,
  "application/pdf": {
    extensions: [".pdf"],
    outputExtension: ".pdf",
    signatureMatches: (
      fileBuffer: Buffer
    ) =>
      fileBuffer.length >= 5 &&
      fileBuffer
        .subarray(0, 5)
        .equals(
          Buffer.from("%PDF-", "ascii")
        ),
  },
  "image/jpeg": {
    extensions: [".jpg", ".jpeg"],
    outputExtension: ".jpg",
    signatureMatches: (
      fileBuffer: Buffer
    ) =>
      fileBuffer.length >= 3 &&
      fileBuffer[0] === 0xff &&
      fileBuffer[1] === 0xd8 &&
      fileBuffer[2] === 0xff,
  },
  "image/png": {
    extensions: [".png"],
    outputExtension: ".png",
    signatureMatches: (
      fileBuffer: Buffer
    ) =>
      fileBuffer.length >= 8 &&
      fileBuffer
        .subarray(0, 8)
        .equals(
          Buffer.from([
            0x89,
            0x50,
            0x4e,
            0x47,
            0x0d,
            0x0a,
            0x1a,
            0x0a,
          ])
        ),
  },
} as const;

function requireObject(
  value: unknown
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Request body must be a JSON object."
    );
  }

  return value as Record<string, unknown>;
}

function rejectUnsupportedFields(
  body: Record<string, unknown>
) {
  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) {
      throw new Error(
        `Unsupported field: ${field}.`
      );
    }
  }
}

function requireString(
  value: unknown,
  fieldName: string,
  maximumLength: number
) {
  if (typeof value !== "string") {
    throw new Error(
      `${fieldName} must be a string.`
    );
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(
      `${fieldName} is required.`
    );
  }

  if (trimmed.length > maximumLength) {
    throw new Error(
      `${fieldName} must be ${maximumLength} characters or fewer.`
    );
  }

  return trimmed;
}

function sanitizeFileName(
  value: string
) {
  const withoutPath =
    value.split(/[\\/]/).pop() ?? value;

  const normalizedName = withoutPath
    .replace(
      /[<>:"/\\|?*\u0000-\u001f]/g,
      "_"
    )
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalizedName.length === 0 ||
    normalizedName === "." ||
    normalizedName === ".."
  ) {
    throw new Error(
      "originalFileName must contain a usable file name."
    );
  }

  if (normalizedName.length <= 160) return normalizedName;
  // Shorten the name, not its extension: truncation must not reject a real JPG
  // or disguise an unsupported suffix as a supported one.
  const dot = normalizedName.lastIndexOf(".");
  if (dot <= 0) return normalizedName.slice(0, 160);
  const extension = normalizedName.slice(dot);
  if (extension.length >= 160) throw new Error("originalFileName must contain a usable file extension.");
  return normalizedName.slice(0, 160 - extension.length) + extension;
}

function requireContentType(
  value: unknown
): Stage2DocumentContentType {
  const contentType = requireString(
    value,
    "contentType",
    100
  ).toLowerCase();

  if (
    !(
      allowedStage2DocumentContentTypes as
        readonly string[]
    ).includes(contentType)
  ) {
    throw new Error(
      "contentType must be PDF, JPEG, PNG, HEIC, or HEIF."
    );
  }

  return contentType as
    Stage2DocumentContentType;
}

function decodeCanonicalBase64(
  value: unknown
) {
  const contentBase64 = requireString(
    value,
    "contentBase64",
    maximumBase64Length
  );

  if (
    contentBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(
      contentBase64
    )
  ) {
    throw new Error(
      "contentBase64 must be canonical base64."
    );
  }

  const fileBuffer = Buffer.from(
    contentBase64,
    "base64"
  );

  if (
    fileBuffer.length === 0 ||
    fileBuffer.length >
      maximumStage2DocumentBytes
  ) {
    throw new Error(
      `Uploaded content must contain between 1 and ${maximumStage2DocumentBytes} bytes.`
    );
  }

  if (
    fileBuffer.toString("base64") !==
    contentBase64
  ) {
    throw new Error(
      "contentBase64 must be canonical base64."
    );
  }

  return {
    contentBase64,
    fileBuffer,
  };
}

function getFileExtension(
  fileName: string
) {
  const finalDotIndex =
    fileName.lastIndexOf(".");

  if (
    finalDotIndex <= 0 ||
    finalDotIndex ===
      fileName.length - 1
  ) {
    return null;
  }

  return fileName
    .slice(finalDotIndex)
    .toLowerCase();
}

export function parsePublicStage2DocumentUpload(
  value: unknown
): PublicStage2DocumentUploadRequest {
  const body = requireObject(value);

  rejectUnsupportedFields(body);

  const packetItemId = requireString(
    body.packetItemId,
    "packetItemId",
    36
  );

  if (!uuidPattern.test(packetItemId)) {
    throw new Error(
      "packetItemId must be a valid UUID."
    );
  }

  const originalFileName =
    sanitizeFileName(
      requireString(
        body.originalFileName,
        "originalFileName",
        260
      )
    );

  const contentType =
    requireContentType(body.contentType);

  const { contentBase64 } =
    decodeCanonicalBase64(
      body.contentBase64
    );

  return {
    packetItemId,
    originalFileName,
    contentType,
    contentBase64,
  };
}

export function validateStage2DocumentContent(
  request:
    PublicStage2DocumentUploadRequest
): ValidatedStage2DocumentUpload {
  const definition =
    contentTypeDefinitions[
      request.contentType
    ];

  const fileExtension =
    getFileExtension(
      request.originalFileName
    );

  if (
    !fileExtension ||
    !(
      definition.extensions as
        readonly string[]
    ).includes(fileExtension)
  ) {
    throw new Error(
      "The file extension does not match contentType."
    );
  }

  const { fileBuffer } =
    decodeCanonicalBase64(
      request.contentBase64
    );

  if (
    !definition.signatureMatches(
      fileBuffer
    )
  ) {
    throw new Error(
      "The file signature does not match contentType."
    );
  }

  return {
    packetItemId:
      request.packetItemId,
    originalFileName:
      request.originalFileName,
    contentType:
      request.contentType,
    fileExtension:
      definition.outputExtension,
    fileBuffer,
  };
}
