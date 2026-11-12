using Aqours.Application.Features.Reports;
using Aqours.Domain.Features.Reports;
using Microsoft.Extensions.Logging;

namespace Aqours.Infrastructure.Features.Reports;

public sealed class FileSystemChatAttachmentStorage
    : IChatAttachmentStorage
{
    private readonly string _rootPath;
    private readonly string _rootPrefix;
    private readonly ILogger<FileSystemChatAttachmentStorage> _logger;

    public FileSystemChatAttachmentStorage(string rootPath, ILogger<FileSystemChatAttachmentStorage> logger)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootPath);
        _logger = logger;
        _rootPath = Path.GetFullPath(rootPath);
        _rootPrefix = _rootPath.EndsWith(Path.DirectorySeparatorChar)
            ? _rootPath
            : _rootPath + Path.DirectorySeparatorChar;

        Directory.CreateDirectory(_rootPath);
        var probePath = Path.Combine(_rootPath, $".write-check-{Guid.NewGuid():N}");
        try
        {
            using (new FileStream(probePath, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException($"Chat attachment storage root '{_rootPath}' is not writable.", error);
        }
        finally
        {
            if (File.Exists(probePath)) File.Delete(probePath);
        }
    }

    public async Task<string> SaveAsync(Guid reportId, Guid messageId, Guid attachmentId, string contentType,
        long expectedSizeBytes, Stream content, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (reportId == Guid.Empty || messageId == Guid.Empty || attachmentId == Guid.Empty)
            throw new ArgumentException("Attachment IDs must be non-empty.");
        if (expectedSizeBytes is < 1 or > ReportMessageAttachment.MaxSizeBytes)
            throw new ArgumentOutOfRangeException(nameof(expectedSizeBytes));
        var extension = ChatAttachmentFiles.StorageExtension(contentType);
        var storageKey = $"{reportId:N}/{messageId:N}/{attachmentId:N}{extension}";
        var fullPath = Resolve(storageKey);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        try
        {
            await using var output = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                81920, FileOptions.Asynchronous | FileOptions.SequentialScan);
            var buffer = new byte[81920];
            long total = 0;
            while (true)
            {
                var read = await content.ReadAsync(buffer, ct);
                if (read == 0) break;
                total += read;
                if (total > expectedSizeBytes || total > ReportMessageAttachment.MaxSizeBytes)
                    throw new InvalidDataException("Attachment content exceeded its validated size.");
                await output.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            if (total != expectedSizeBytes) throw new InvalidDataException("Attachment content did not match its validated size.");
            await output.FlushAsync(ct);
            return storageKey;
        }
        catch
        {
            try { if (File.Exists(fullPath)) File.Delete(fullPath); }
            catch (Exception cleanupError)
            {
                _logger.LogError(cleanupError, "Could not remove partially written chat attachment {StorageKey}.", storageKey);
            }
            throw;
        }
    }

    public Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var path = Resolve(storageKey);
        Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string storageKey, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var path = Resolve(storageKey);
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception error)
        {
            _logger.LogWarning(error, "Could not remove uncommitted chat attachment {StorageKey}.", storageKey);
            throw;
        }
        return Task.CompletedTask;
    }

    private string Resolve(string storageKey)
    {
        var segments = storageKey.Split('/');
        if (segments.Length != 3 ||
            !Guid.TryParseExact(segments[0], "N", out _) ||
            !Guid.TryParseExact(segments[1], "N", out _) ||
            segments[2].Length != 36 ||
            !Guid.TryParseExact(Path.GetFileNameWithoutExtension(segments[2]), "N", out _) ||
            Path.GetExtension(segments[2]) is not (".png" or ".jpg"))
            throw new InvalidDataException("The attachment storage key is invalid.");

        var path = Path.GetFullPath(Path.Combine(_rootPath, Path.Combine(segments)));
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (!path.StartsWith(_rootPrefix, comparison)) throw new InvalidDataException("The attachment path escaped its storage root.");
        return path;
    }
}
