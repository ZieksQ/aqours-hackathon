using Aqours.Domain.Features.Reports;
using System.Text;

namespace Aqours.Application.Features.Reports;

public sealed record ChatAttachmentMetadata(Guid Id, string FileName, string ContentType, long SizeBytes);

public sealed record NewChatAttachment(string FileName, string ContentType, long SizeBytes, Stream Content);

public sealed record ChatAttachmentDownload(string FileName, string ContentType, long SizeBytes, Stream Content);

public interface IChatAttachmentStorage
{
    Task<string> SaveAsync(Guid reportId, Guid messageId, Guid attachmentId, string contentType,
        long expectedSizeBytes, Stream content, CancellationToken ct);

    Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct);

    Task DeleteAsync(string storageKey, CancellationToken ct);
}

public static class ChatAttachmentFiles
{
    public static string SanitizeFileName(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var leaf = value.Replace('\\', '/').Split('/').Last().Normalize(NormalizationForm.FormKC);
        var safe = new string(leaf.Where(character => !char.IsControl(character)).ToArray()).Trim().Trim('.');
        if (safe.Length is < 1 or > ReportMessageAttachment.MaxFileNameLength)
            throw new ArgumentException("Use a file name with up to 180 characters.", nameof(value));
        return safe;
    }

    public static bool MatchesExtension(string fileName, string contentType)
    {
        var extension = Path.GetExtension(fileName);
        return contentType switch
        {
            "image/png" => extension.Equals(".png", StringComparison.OrdinalIgnoreCase),
            "image/jpeg" => extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase) ||
                extension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }

    public static string StorageExtension(string contentType) => contentType switch
    {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        _ => throw new ArgumentOutOfRangeException(nameof(contentType))
    };
}
