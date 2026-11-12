namespace Aqours.Domain.Features.Reports;

public sealed class ReportMessageAttachment
{
    public const int MaxFileNameLength = 180;
    public const int MaxStorageKeyLength = 512;
    public const long MaxSizeBytes = 5 * 1024 * 1024;

    public Guid Id { get; private set; }
    public Guid MessageId { get; private set; }
    public string FileName { get; private set; } = null!;
    public string ContentType { get; private set; } = null!;
    public long SizeBytes { get; private set; }
    public string StorageKey { get; private set; } = null!;
    public int Position { get; private set; }
    public ReportMessage Message { get; private set; } = null!;

    private ReportMessageAttachment() { }

    public ReportMessageAttachment(Guid id, Guid messageId, string fileName, string contentType,
        long sizeBytes, string storageKey, int position)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        if (id == Guid.Empty) throw new ArgumentException("An attachment ID is required.", nameof(id));
        if (messageId == Guid.Empty) throw new ArgumentException("A message ID is required.", nameof(messageId));
        if (fileName.Length > MaxFileNameLength || fileName.IndexOfAny(['/', '\\', '\r', '\n']) >= 0)
            throw new ArgumentException("Use a safe file name with up to 180 characters.", nameof(fileName));
        if (contentType is not ("image/png" or "image/jpeg"))
            throw new ArgumentException("Only PNG and JPEG attachments are supported.", nameof(contentType));
        if (sizeBytes is < 1 or > MaxSizeBytes) throw new ArgumentOutOfRangeException(nameof(sizeBytes));
        if (storageKey.Length > MaxStorageKeyLength) throw new ArgumentException("The storage key is too long.", nameof(storageKey));
        if (position is < 0 or > 2) throw new ArgumentOutOfRangeException(nameof(position));

        Id = id;
        MessageId = messageId;
        FileName = fileName;
        ContentType = contentType;
        SizeBytes = sizeBytes;
        StorageKey = storageKey;
        Position = position;
    }
}
