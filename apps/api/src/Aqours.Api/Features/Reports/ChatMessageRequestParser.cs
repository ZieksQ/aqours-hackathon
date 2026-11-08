using System.Text;
using System.Text.Json;
using Aqours.Application.Features.Reports;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace Aqours.Api.Features.Reports;

public sealed record ParsedChatMessage(string? Body, IReadOnlyList<NewChatAttachment> Attachments);

public sealed record ChatMessageParseResult(ParsedChatMessage? Value, IResult? Error)
{
    public bool Succeeded => Value is not null;
}

public static class ChatMessageRequestParser
{
    public const long MaximumRequestBytes = 16 * 1024 * 1024;
    public const int MaximumFileBytes = 5 * 1024 * 1024;
    private const int MaximumFiles = 3;
    private const int MaximumBodyBytes = ReportMessageBodyLimit * 4;
    private const int MaximumHeadersCount = 16;
    private const int MaximumHeadersLength = 8192;
    private const int ReportMessageBodyLimit = 2000;

    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    public static async Task<ChatMessageParseResult> ParseAsync(HttpRequest request, CancellationToken ct)
    {
        if (request.ContentLength > MaximumRequestBytes)
            return TooLarge();
        if (request.Headers.ContentEncoding.Any(value => !string.Equals(value, "identity", StringComparison.OrdinalIgnoreCase)))
            return Unsupported("Compressed request bodies are not supported.");
        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var contentType))
            return Unsupported("Use application/json or multipart/form-data.");

        if (IsJson(contentType.MediaType.Value))
        {
            try
            {
                var requestBody = await request.ReadFromJsonAsync<MessageRequest>(cancellationToken: ct);
                return new(new ParsedChatMessage(requestBody?.Body, []), null);
            }
            catch (JsonException)
            {
                return Invalid("body", "Send a valid JSON message body.");
            }
            catch (BadHttpRequestException error) when (error.StatusCode == StatusCodes.Status413PayloadTooLarge)
            {
                return TooLarge();
            }
        }

        if (!string.Equals(contentType.MediaType.Value, "multipart/form-data", StringComparison.OrdinalIgnoreCase))
            return Unsupported("Use application/json or multipart/form-data.");

        var boundary = HeaderUtilities.RemoveQuotes(contentType.Parameters
            .FirstOrDefault(parameter => parameter.Name.Equals("boundary", StringComparison.OrdinalIgnoreCase))?.Value ?? default).Value;
        if (string.IsNullOrWhiteSpace(boundary) || boundary.Length > 70)
            return Unsupported("The multipart boundary is missing or invalid.");

        var attachments = new List<NewChatAttachment>(MaximumFiles);
        try
        {
            using var bounded = new RequestBodyLimitStream(request.Body, MaximumRequestBytes);
            var reader = new MultipartReader(boundary, bounded)
            {
                HeadersCountLimit = MaximumHeadersCount,
                HeadersLengthLimit = MaximumHeadersLength
            };
            var bodySeen = false;
            string? body = null;
            MultipartSection? section;
            while ((section = await reader.ReadNextSectionAsync(ct)) is not null)
            {
                var currentSection = section!;
                var sectionHeaders = currentSection.Headers;
                if (sectionHeaders is null || sectionHeaders.Count > MaximumHeadersCount)
                    return DisposeAndInvalid(attachments, "request", "The multipart request has too many headers.");
                if (!sectionHeaders.TryGetValue(HeaderNames.ContentDisposition, out var rawDisposition) ||
                    !ContentDispositionHeaderValue.TryParse(rawDisposition.ToString(), out var disposition) ||
                    disposition is null ||
                    !string.Equals(disposition.DispositionType.Value, "form-data", StringComparison.OrdinalIgnoreCase))
                    return DisposeAndInvalid(attachments, "request", "Each multipart section needs a valid form-data disposition.");

                var name = HeaderUtilities.RemoveQuotes(disposition.Name).Value;
                var rawFileName = disposition.FileNameStar.HasValue
                    ? HeaderUtilities.RemoveQuotes(disposition.FileNameStar).Value
                    : HeaderUtilities.RemoveQuotes(disposition.FileName).Value;
                var isFile = disposition.FileNameStar.HasValue || disposition.FileName.HasValue;
                if (name == "body" && !isFile)
                {
                    if (bodySeen) return DisposeAndInvalid(attachments, "body", "Send the body field once.");
                    bodySeen = true;
                    var bytes = await ReadSectionAsync(currentSection.Body, MaximumBodyBytes, false, ct);
                    if (bytes is null) return DisposeAndInvalid(attachments, "body", "Message body must be up to 2,000 characters.");
                    try { body = StrictUtf8.GetString(bytes); }
                    catch (DecoderFallbackException) { return DisposeAndInvalid(attachments, "body", "Message body must use UTF-8 text."); }
                    continue;
                }

                if (name != "files" || !isFile || string.IsNullOrWhiteSpace(rawFileName))
                    return DisposeAndInvalid(attachments, "request", "Use one body field and up to 3 files fields.");
                if (attachments.Count == MaximumFiles)
                    return DisposeAndInvalid(attachments, "files", "Attach up to 3 images per message.");

                var partType = currentSection.ContentType;
                if (!MediaTypeHeaderValue.TryParse(partType, out var fileContentType))
                    return DisposeAndInvalid(attachments, "files", "Each image needs an image/png or image/jpeg content type.");
                var normalizedType = (fileContentType?.MediaType.Value ?? string.Empty).ToLowerInvariant();
                if (normalizedType is not ("image/png" or "image/jpeg"))
                    return DisposeAndInvalid(attachments, "files", "Only PNG and JPEG images are supported.");

                string fileName;
                try { fileName = ChatAttachmentFiles.SanitizeFileName(rawFileName); }
                catch (ArgumentException) { return DisposeAndInvalid(attachments, "files", "Use a safe image file name with up to 180 characters."); }
                if (!ChatAttachmentFiles.MatchesExtension(fileName, normalizedType))
                    return DisposeAndInvalid(attachments, "files", "The file extension and image content type must match.");

                var imageBytes = await ReadSectionAsync(currentSection.Body, MaximumFileBytes, true, ct);
                if (imageBytes is null) return DisposeAndInvalid(attachments, "files", "Each image must be 5 MiB or smaller.", StatusCodes.Status413PayloadTooLarge);
                if (imageBytes.Length == 0)
                    return DisposeAndInvalid(attachments, "files", "Images must not be empty.");
                if (!HasExpectedSignature(imageBytes, normalizedType))
                    return DisposeAndInvalid(attachments, "files", "Image bytes must match the declared PNG or JPEG type.");

                attachments.Add(new NewChatAttachment(fileName, normalizedType, imageBytes.LongLength,
                    new MemoryStream(imageBytes, writable: false)));
            }

            return new(new ParsedChatMessage(body, attachments), null);
        }
        catch (PayloadTooLargeException)
        {
            Dispose(attachments);
            return TooLarge();
        }
        catch (InvalidDataException)
        {
            Dispose(attachments);
            return Invalid("request", "The multipart request is malformed or exceeds a supported limit.");
        }
        catch (BadHttpRequestException error) when (error.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            Dispose(attachments);
            return TooLarge();
        }
    }

    private static async Task<byte[]?> ReadSectionAsync(Stream source, int maximumBytes, bool tooLargeIs413, CancellationToken ct)
    {
        await using var destination = new MemoryStream(Math.Min(maximumBytes, 81920));
        var buffer = new byte[81920];
        var total = 0;
        while (true)
        {
            var read = await source.ReadAsync(buffer, ct);
            if (read == 0) break;
            total += read;
            if (total > maximumBytes)
            {
                if (tooLargeIs413) throw new PayloadTooLargeException();
                return null;
            }
            await destination.WriteAsync(buffer.AsMemory(0, read), ct);
        }
        return destination.ToArray();
    }

    private static bool HasExpectedSignature(ReadOnlySpan<byte> bytes, string contentType) => contentType switch
    {
        "image/png" => bytes.Length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E &&
            bytes[3] == 0x47 && bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A,
        "image/jpeg" => bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF,
        _ => false
    };

    private static bool IsJson(string? mediaType) =>
        string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase) ||
        (mediaType?.StartsWith("application/", StringComparison.OrdinalIgnoreCase) == true &&
         mediaType.EndsWith("+json", StringComparison.OrdinalIgnoreCase));

    private static ChatMessageParseResult DisposeAndInvalid(List<NewChatAttachment> attachments, string field, string detail,
        int statusCode = StatusCodes.Status400BadRequest)
    {
        Dispose(attachments);
        return statusCode == StatusCodes.Status413PayloadTooLarge ? TooLarge(detail) : Invalid(field, detail);
    }

    private static void Dispose(IEnumerable<NewChatAttachment> attachments)
    {
        foreach (var attachment in attachments) attachment.Content.Dispose();
    }

    private static ChatMessageParseResult Invalid(string field, string detail) =>
        new(null, Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [detail] }));

    private static ChatMessageParseResult Unsupported(string detail) =>
        new(null, Results.Problem(statusCode: StatusCodes.Status415UnsupportedMediaType, title: "Unsupported Media Type", detail: detail));

    private static ChatMessageParseResult TooLarge(string detail = "The message upload must be 16 MiB or smaller.") =>
        new(null, Results.Problem(statusCode: StatusCodes.Status413PayloadTooLarge, title: "Payload Too Large", detail: detail));

    private sealed class PayloadTooLargeException : Exception;

    private sealed class RequestBodyLimitStream(Stream inner, long limit) : Stream
    {
        private long _read;
        private bool _checkedEnd;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        public override int Read(byte[] buffer, int offset, int count)
        {
            if (_read == limit) return CheckEndSync();
            var read = inner.Read(buffer, offset, (int)Math.Min(count, limit - _read));
            _read += read;
            return read;
        }

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (_read == limit) return await CheckEndAsync(cancellationToken);
            var read = await inner.ReadAsync(buffer[..(int)Math.Min(buffer.Length, limit - _read)], cancellationToken);
            _read += read;
            return read;
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
            ReadArrayAsync(buffer, offset, count, cancellationToken);

        private async Task<int> ReadArrayAsync(byte[] buffer, int offset, int count, CancellationToken ct)
        {
            if (_read == limit) return await CheckEndAsync(ct);
            var read = await inner.ReadAsync(buffer, offset, (int)Math.Min(count, limit - _read), ct);
            _read += read;
            return read;
        }

        private int CheckEndSync()
        {
            if (_checkedEnd) return 0;
            var probe = new byte[1];
            if (inner.Read(probe, 0, 1) != 0) throw new PayloadTooLargeException();
            _checkedEnd = true;
            return 0;
        }

        private async ValueTask<int> CheckEndAsync(CancellationToken ct)
        {
            if (_checkedEnd) return 0;
            var probe = new byte[1];
            if (await inner.ReadAsync(probe, ct) != 0) throw new PayloadTooLargeException();
            _checkedEnd = true;
            return 0;
        }

        protected override void Dispose(bool disposing) { }
        public override ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
