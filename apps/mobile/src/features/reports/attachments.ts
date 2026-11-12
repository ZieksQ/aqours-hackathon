import type { Message } from "../../shared/api";

export const MAX_MESSAGE_ATTACHMENTS = 3;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MESSAGE_UPLOAD_TIMEOUT_MS = 60_000;

export type PickedImage = {
  key: string;
  uri: string;
  fileName: string;
  contentType: "image/png" | "image/jpeg";
  sizeBytes?: number;
};

export function imageContentType(
  fileName: string,
  mimeType?: string | null,
): PickedImage["contentType"] | null {
  const extension = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1];
  const extensionType =
    extension === "png"
      ? "image/png"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : null;
  const mime = mimeType?.toLowerCase();
  const mimeTypeValue =
    mime === "image/png" || mime === "image/jpeg" ? mime : null;
  if (!extensionType || (mime && !mimeTypeValue)) return null;
  if (mimeTypeValue && mimeTypeValue !== extensionType) return null;
  return extensionType;
}

export function imageValidationError(
  fileName: string,
  mimeType?: string | null,
  sizeBytes?: number,
) {
  if (!imageContentType(fileName, mimeType))
    return "Choose a JPG or PNG image. HEIC and other formats are not supported.";
  if (
    sizeBytes !== undefined &&
    sizeBytes > MAX_MESSAGE_ATTACHMENT_BYTES
  )
    return "Each photo must be 5 MB or smaller.";
  return null;
}

export function messagePreview(message: Message) {
  const body = message.body?.trim() ?? "";
  const count = message.attachments?.length ?? 0;
  const photos =
    count === 1 ? "Sent a photo" : count > 1 ? `Sent ${count} photos` : "";
  if (body) return `“${body}”${photos ? ` · ${photos}` : ""}`;
  return photos || "Sent a message";
}
