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
public sealed record TicketMessage(Guid Id, Guid ReportId, string SenderId, string SenderName, string SenderRole, string Body, DateTimeOffset CreatedAt);
public sealed record MessagePage(IReadOnlyList<TicketMessage> Items, long? NextBefore);

public interface IStaffReportStore
{
    Task<Ticket?> FindAsync(Guid id, CancellationToken ct);
    Task<TicketPage> ListAsync(QueueCriteria criteria, string staffId, CancellationToken ct);
    Task<bool> ClaimAsync(Guid id, string staffId, DateTimeOffset now, CancellationToken ct);
    // The callback runs under a report-row lock. Its entity/message writes commit together.
    Task<TicketResult<ReportMessage>> WriteAsync(Guid id, Func<Report, TicketResult<ReportMessage>> change, CancellationToken ct);
    Task<MessagePage> MessagesAsync(Guid id, long? before, int pageSize, CancellationToken ct);
    Task<TicketMessage> MessageAsync(Guid messageId, CancellationToken ct);
}

public interface IReportNotifications
{
    Task ReportCreatedAsync(Guid id);
    Task TicketUpdatedAsync(Guid id);
    Task MessageCreatedAsync(TicketMessage message);
}

public sealed class StaffReportService(IStaffReportStore store, IReportNotifications notifications, TimeProvider clock)
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

    public async Task<TicketResult<TicketMessage>> SendAsync(ReportActor actor, Guid id, string? body, CancellationToken ct = default)
    {
        var access = await DetailsAsync(actor, id, ct);
        if (!access.Succeeded) return new(Failure: access.Failure);
        if (actor.Role == AccountRoles.Admin || (actor.Role == AccountRoles.Staff && access.Value!.Report.AssignedStaffId != actor.Id))
            return new(Failure: TicketFailure.Forbidden);
        body = body?.Trim();
        if (string.IsNullOrEmpty(body) || body.Length > ReportMessage.MaxBodyLength)
            return new(Failure: TicketFailure.Invalid, Error: "Message is required (up to 2,000 characters).");
        var result = await store.WriteAsync(id, report =>
        {
            if (actor.Role == AccountRoles.Staff && report.AssignedStaffId != actor.Id) return new(Failure: TicketFailure.Forbidden);
            if (report.Status != ReportStatus.InProgress) return new(Failure: TicketFailure.Conflict, Error: "Only claimed, unresolved tickets accept messages.");
            return new(new ReportMessage(id, actor.Id, body, clock.GetUtcNow()));
        }, ct);
        if (!result.Succeeded) return new(Failure: result.Failure, Error: result.Error);
        var message = await store.MessageAsync(result.Value!.Id, ct);
        await notifications.MessageCreatedAsync(message);
        return new(message);
    }

    private static bool ValidEnum<T>(string? value) where T : struct, Enum => value is null ||
        Enum.TryParse<T>(value, out var parsed) && Enum.IsDefined(parsed) && parsed.ToString() == value;
}
