using Aqours.Domain.Features.Accounts;
using Aqours.Domain.Features.Reports;

namespace Aqours.Application.Features.Reports;

public sealed record ReportActor(string Id, string Role)
{
    public bool IsPersonnel => Role is AccountRoles.Staff or AccountRoles.Admin;
}
public enum TicketFailure { None, Invalid, Forbidden, NotFound, Conflict }
public sealed record TicketResult<T>(T? Value = default, TicketFailure Failure = TicketFailure.None, string? Error = null)
{
    public bool Succeeded => Failure == TicketFailure.None;
}
public sealed record ReportPerson(string Id, string Name, string Email);
public sealed record Ticket(Report Report, ReportPerson Customer, ReportPerson? AssignedStaff);
public sealed record QueueCriteria(string Tab = "unassigned", string? Search = null, string? Status = null,
    string? Priority = null, string? Assignment = null, int Page = 1, int PageSize = 20);
public sealed record QueueSummary(int Unassigned, int InProgress, int HighPriority);
public sealed record TicketPage(IReadOnlyList<Ticket> Items, int Page, int PageSize, int TotalCount, QueueSummary Summary);
public sealed record TicketMessage(Guid Id, Guid ReportId, string SenderId, string SenderName, string SenderRole,
    string Body, DateTimeOffset CreatedAt, IReadOnlyList<ChatAttachmentMetadata>? Attachments = null);
public sealed record MessagePage(IReadOnlyList<TicketMessage> Items, long? NextBefore);

public sealed class TicketCommitOutcomeUncertainException(string message, Exception innerException)
    : Exception(message, innerException);

public interface IStaffReportStore
{
    Task<Ticket?> FindAsync(Guid id, CancellationToken ct);
    Task<TicketPage> ListAsync(QueueCriteria criteria, string staffId, CancellationToken ct);
    Task<bool> ClaimAsync(Guid id, string staffId, DateTimeOffset now, CancellationToken ct);
    // The callback runs under a report-row lock. Its entity/message writes commit together.
    Task<TicketResult<ReportMessage>> WriteAsync(Guid id, Func<Report, TicketResult<ReportMessage>> change, CancellationToken ct);
    Task<MessagePage> MessagesAsync(Guid id, long? before, int pageSize, CancellationToken ct);
    Task<TicketMessage> MessageAsync(Guid messageId, CancellationToken ct);
    Task<ReportMessageAttachment?> FindAttachmentAsync(Guid attachmentId, CancellationToken ct);
}

public interface IReportNotifications
{
    Task ReportCreatedAsync(Guid id);
    Task TicketUpdatedAsync(Guid id);
    Task MessageCreatedAsync(TicketMessage message);
}

public sealed class StaffReportService(IStaffReportStore store, IReportNotifications notifications, TimeProvider clock,
    IChatAttachmentStorage attachmentStorage)
{
    public async Task<TicketResult<TicketPage>> QueueAsync(ReportActor actor, QueueCriteria criteria, CancellationToken ct = default)
    {
        if (!actor.IsPersonnel) return new(Failure: TicketFailure.Forbidden);
        if (criteria.Page < 1 || criteria.PageSize is < 1 or > 100 || criteria.Search?.Length > 200 ||
            criteria.Tab is not ("unassigned" or "mine" or "in-progress" or "all") ||
            criteria.Assignment is not (null or "unassigned" or "mine" or "assigned") ||
            !ValidEnum<ReportStatus>(criteria.Status) || !ValidEnum<ReportPriority>(criteria.Priority))
            return new(Failure: TicketFailure.Invalid, Error: "Invalid queue filters or pagination.");
        return new(await store.ListAsync(criteria with { Search = criteria.Search?.Trim() }, actor.Id, ct));
    }

    public async Task<TicketResult<Ticket>> DetailsAsync(ReportActor actor, Guid id, CancellationToken ct = default)
    {
        var ticket = await store.FindAsync(id, ct);
        if (ticket is null || (!actor.IsPersonnel && ticket.Report.CustomerId != actor.Id)) return new(Failure: TicketFailure.NotFound);
        if (!actor.IsPersonnel && actor.Role != AccountRoles.Customer) return new(Failure: TicketFailure.Forbidden);
        return new(ticket);
    }

    public async Task<TicketResult<Ticket>> ClaimAsync(ReportActor actor, Guid id, CancellationToken ct = default)
    {
        if (actor.Role != AccountRoles.Staff) return new(Failure: TicketFailure.Forbidden);
        if (await store.FindAsync(id, ct) is null) return new(Failure: TicketFailure.NotFound);
        if (!await store.ClaimAsync(id, actor.Id, clock.GetUtcNow(), ct))
            return new(Failure: TicketFailure.Conflict, Error: "This report has already been claimed. Refresh to see its handler.");
        await notifications.TicketUpdatedAsync(id);
        return await DetailsAsync(actor, id, ct);
    }

    public async Task<TicketResult<Ticket>> ChangeAsync(ReportActor actor, Guid id, string? priority, string? status, CancellationToken ct = default)
    {
        if (actor.Role != AccountRoles.Staff) return new(Failure: TicketFailure.Forbidden);
        if ((priority is null) == (status is null) || (priority is not null && !ValidEnum<ReportPriority>(priority)) ||
            (status is not null && status != nameof(ReportStatus.Resolved)))
            return new(Failure: TicketFailure.Invalid, Error: "Choose Low, Normal, or High priority, or resolve an In Progress ticket.");
        var result = await store.WriteAsync(id, report =>
        {
            if (report.AssignedStaffId != actor.Id) return new(Failure: TicketFailure.Forbidden);
            if (report.Status != ReportStatus.InProgress) return new(Failure: TicketFailure.Conflict, Error: "Resolved tickets are read-only.");
            if (priority is not null) report.ChangePriority(Enum.Parse<ReportPriority>(priority));
            else report.Resolve(clock.GetUtcNow());
            return new();
        }, ct);
        if (!result.Succeeded) return new(Failure: result.Failure, Error: result.Error);
        await notifications.TicketUpdatedAsync(id);
        return await DetailsAsync(actor, id, ct);
    }

    public async Task<TicketResult<MessagePage>> HistoryAsync(ReportActor actor, Guid id, long? before, int pageSize, CancellationToken ct = default)
    {
        var access = await DetailsAsync(actor, id, ct);
        if (!access.Succeeded) return new(Failure: access.Failure);
        if (before is <= 0 || pageSize is < 1 or > 100) return new(Failure: TicketFailure.Invalid, Error: "Invalid history cursor or page size.");
        return new(await store.MessagesAsync(id, before, pageSize, ct));
    }

    public async Task<TicketResult<Ticket>> AuthorizeSendAsync(ReportActor actor, Guid id, CancellationToken ct = default)
    {
        var access = await DetailsAsync(actor, id, ct);
        if (!access.Succeeded) return new(Failure: access.Failure);
        if (actor.Role == AccountRoles.Admin || actor.Role is not (AccountRoles.Customer or AccountRoles.Staff) ||
            (actor.Role == AccountRoles.Staff && access.Value!.Report.AssignedStaffId != actor.Id))
            return new(Failure: TicketFailure.Forbidden);
        return access;
    }

    public Task<TicketResult<TicketMessage>> SendAsync(ReportActor actor, Guid id, string? body, CancellationToken ct = default) =>
        SendAsync(actor, id, body, [], ct);

    public async Task<TicketResult<TicketMessage>> SendAsync(ReportActor actor, Guid id, string? body,
        IReadOnlyList<NewChatAttachment> attachments, CancellationToken ct = default)
    {
        var access = await AuthorizeSendAsync(actor, id, ct);
        if (!access.Succeeded) return new(Failure: access.Failure);

        body = body?.Trim();
        if (body?.Length > ReportMessage.MaxBodyLength)
            return new(Failure: TicketFailure.Invalid, Error: "Message must be up to 2,000 characters.");
        if (attachments.Count > 3)
            return new(Failure: TicketFailure.Invalid, Error: "Attach up to 3 images per message.");
        if (string.IsNullOrEmpty(body) && attachments.Count == 0)
            return new(Failure: TicketFailure.Invalid, Error: "Message or image attachment is required.");

        var normalized = new List<(string FileName, string ContentType, long SizeBytes, Stream Content)>(attachments.Count);
        foreach (var attachment in attachments)
        {
            string fileName;
            try { fileName = ChatAttachmentFiles.SanitizeFileName(attachment.FileName); }
            catch (ArgumentException) { return new(Failure: TicketFailure.Invalid, Error: "Use a safe image file name with up to 180 characters."); }
            if (attachment.ContentType is not ("image/png" or "image/jpeg") ||
                !ChatAttachmentFiles.MatchesExtension(fileName, attachment.ContentType))
                return new(Failure: TicketFailure.Invalid, Error: "Only matching PNG and JPEG images are supported.");
            if (attachment.SizeBytes is < 1 or > ReportMessageAttachment.MaxSizeBytes)
                return new(Failure: TicketFailure.Invalid, Error: "Each image must be between 1 byte and 5 MiB.");
            if (attachment.Content is null) return new(Failure: TicketFailure.Invalid, Error: "Image content is required.");
            normalized.Add((fileName, attachment.ContentType, attachment.SizeBytes, attachment.Content));
        }

        var message = new ReportMessage(id, actor.Id, body ?? string.Empty, clock.GetUtcNow(), attachments.Count > 0);
        var storageKeys = new List<string>(normalized.Count);
        try
        {
            for (var position = 0; position < normalized.Count; position++)
            {
                var attachment = normalized[position];
                var attachmentId = Guid.NewGuid();
                var storageKey = await attachmentStorage.SaveAsync(id, message.Id, attachmentId,
                    attachment.ContentType, attachment.SizeBytes, attachment.Content, ct);
                storageKeys.Add(storageKey);
                message.AddAttachment(new ReportMessageAttachment(attachmentId, message.Id, attachment.FileName,
                    attachment.ContentType, attachment.SizeBytes, storageKey, position));
            }
        }
        catch
        {
            await CleanupAttachmentsAsync(storageKeys);
            throw;
        }

        TicketResult<ReportMessage> result;
        try
        {
            result = await store.WriteAsync(id, report =>
            {
                if (actor.Role == AccountRoles.Customer && report.CustomerId != actor.Id)
                    return new(Failure: TicketFailure.NotFound);
                if (actor.Role == AccountRoles.Staff && report.AssignedStaffId != actor.Id)
                    return new(Failure: TicketFailure.Forbidden);
                if (actor.Role is not (AccountRoles.Customer or AccountRoles.Staff))
                    return new(Failure: TicketFailure.Forbidden);
                if (report.Status != ReportStatus.InProgress)
                    return new(Failure: TicketFailure.Conflict, Error: "Only claimed, unresolved tickets accept messages.");
                return new(message);
            }, ct);
        }
        catch (TicketCommitOutcomeUncertainException commitError)
        {
            throw new TicketCommitOutcomeUncertainException(
                $"The commit outcome for message {message.Id} is uncertain; its attachment files were retained for reconciliation.",
                commitError);
        }
        catch
        {
            await CleanupAttachmentsAsync(storageKeys);
            throw;
        }

        if (!result.Succeeded)
        {
            await CleanupAttachmentsAsync(storageKeys);
            return new(Failure: result.Failure, Error: result.Error);
        }

        var persistedMessage = await store.MessageAsync(result.Value!.Id, ct);
        await notifications.MessageCreatedAsync(persistedMessage);
        return new(persistedMessage);
    }

    public async Task<TicketResult<ChatAttachmentDownload>> AttachmentAsync(ReportActor actor, Guid reportId,
        Guid attachmentId, CancellationToken ct = default)
    {
        var access = await DetailsAsync(actor, reportId, ct);
        if (!access.Succeeded) return new(Failure: access.Failure);
        var attachment = await store.FindAttachmentAsync(attachmentId, ct);
        if (attachment is null || attachment.Message.ReportId != reportId)
            return new(Failure: TicketFailure.NotFound);
        var content = await attachmentStorage.OpenReadAsync(attachment.StorageKey, ct);
        return new(new ChatAttachmentDownload(attachment.FileName, attachment.ContentType, attachment.SizeBytes, content));
    }

    private async Task CleanupAttachmentsAsync(IEnumerable<string> storageKeys)
    {
        foreach (var storageKey in storageKeys)
        {
            try { await attachmentStorage.DeleteAsync(storageKey, CancellationToken.None); }
            catch { }
        }
    }

    private static bool ValidEnum<T>(string? value) where T : struct, Enum => value is null ||
        Enum.TryParse<T>(value, out var parsed) && Enum.IsDefined(parsed) && parsed.ToString() == value;
}
