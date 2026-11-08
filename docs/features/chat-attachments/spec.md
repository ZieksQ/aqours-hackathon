# Chat message image attachments

**Status:** Backend API contract implemented. Web and mobile attachment UI integration and physical-phone verification are pending.

This feature adds image files to Customer and supplier Personnel conversation messages. It does not add attachments to initial report submission.

Attachments are retained with their messages. The API has no attachment edit, delete, or expiry operation.

## Message API

The existing message POST routes continue to accept `application/json` requests containing `body`. They also accept `multipart/form-data` at the same route:

| Audience | Message POST | Attachment GET |
| --- | --- | --- |
| Customer | `POST /api/reports/{reportId}/messages` | `GET /api/reports/{reportId}/attachments/{attachmentId}` |
| Personnel | `POST /api/staff/reports/{reportId}/messages` | `GET /api/staff/reports/{reportId}/attachments/{attachmentId}` |

Multipart requests may contain one optional text field named `body` and up to three file fields named `files`. For an image-only message, omit `body` or send it empty. A request with neither text nor an image is invalid. The existing JSON message shape remains supported.

Every message response includes an additive `attachments` array; it is empty for older messages without files. Each attachment object has this shape:

```json
{
  "id": "attachment-guid",
  "fileName": "leak.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 123456
}
```

Attachment array order follows upload order. The GET routes return the image inline with its stored content type and size. Responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Attachment IDs are resolved within the requested report, so an ID from a different report is not downloadable through that route.

## Authorization

- Customer endpoints require a Customer session. A Customer can read and send messages only on their own report.
- Personnel endpoints require supplier personnel authorization. Staff and Admin can read report conversations and attachments. Admin is read-only.
- Sending is limited to the report owner and its assigned Staff member while the report is `InProgress`. Admin and unassigned Staff cannot send.
- Resolved report conversations and their attachments remain readable. Sending is rejected once resolved.
- The API checks the actor and report access before parsing the upload, then rechecks sender ownership/assignment and report status while holding the report row lock before committing.

## Validation and preservation

| Limit | Rule |
| --- | --- |
| File types | PNG (`image/png`, `.png`) or JPEG (`image/jpeg`, `.jpg` or `.jpeg`) |
| Files per message | At most 3 |
| Size per file | 1 byte through 5 MiB |
| Total request size | At most 16 MiB, including multipart framing |
| Message body | At most 2,000 characters; it can be empty only when a file is present |
| File name | Sanitized leaf name, at most 180 characters |

The declared MIME type, filename extension, and leading file signature must agree. Empty files and unsupported content encodings are rejected. The API does not decode, re-encode, resize, or strip metadata from the images; stored bytes remain original, including any EXIF or other embedded metadata. The signature check is not a guarantee that the entire file is a well-formed image. Because the request limit includes multipart framing, the maximum combined file payload can be lower than 15 MiB. The production Nginx proxy limit is 16 MiB; any external edge proxy must allow at least the same request size.

## Storage and persistence

`ChatAttachments:RootPath` selects a writable local filesystem directory. The appsettings default is `../../../../storage/chat-attachments`, resolved from the API content root; Compose overrides it with `/workspace/storage/chat-attachments` in development and `/app/storage/chat-attachments` in production. The API creates and checks the configured directory at startup. Compose development bind-mounts the ignored repository directory `storage/chat-attachments`; production uses the persistent `production-chat-attachments` named volume. The production API runs as UID/GID `1654` with a read-only root filesystem; the mounted attachment volume remains writable.

PostgreSQL stores attachment metadata in `report_message_attachments`, including a relative `storage_key`; image bytes are not stored in the database. Files are written first, then the message and metadata are saved together in a database transaction under the report row lock. Confirmed failed writes trigger file cleanup. When commit outcome cannot be determined, files are retained for manual reconciliation. There is no background cleanup process; see the [deployment runbook](../../deployment.md#chat-attachment-reconciliation) for paired backups and careful manual reconciliation.

Apply the generated `20261108102951_ChatMessageAttachments` migration explicitly with the repository EF command before starting an API instance with this feature. API startup does not apply migrations. See the root [README](../../../README.md) for local setup and the [architecture rules](../../architecture.md) for layer boundaries.
