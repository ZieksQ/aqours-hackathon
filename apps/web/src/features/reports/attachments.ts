export const MAX_MESSAGE_ATTACHMENTS = 3;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function imageValidationError(file: File) {
  const extension = file.name.toLowerCase().match(/\.([^.]+)$/)?.[1];
  const extensionType =
    extension === "png"
      ? "image/png"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : null;
  const mime = file.type.toLowerCase();
  if (
    !extensionType ||
    (mime !== "" && mime !== "image/png" && mime !== "image/jpeg") ||
    (mime !== "" && mime !== extensionType)
  )
    return "Choose a JPG or PNG image. HEIC and other formats are not supported.";
  if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES)
    return "Each photo must be 5 MB or smaller.";
  return null;
}
