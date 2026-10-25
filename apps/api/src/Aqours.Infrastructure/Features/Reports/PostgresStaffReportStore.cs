using Aqours.Application.Features.Reports;
using Aqours.Domain.Features.Reports;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Aqours.Infrastructure.Features.Reports;

public sealed class PostgresStaffReportStore(AqoursDbContext db) : IStaffReportStore
{
    private IQueryable<Ticket> Tickets(IQueryable<Report> reports) =>
        from report in reports.AsNoTracking()
        join customer in db.Users on report.CustomerId equals customer.Id
        join handler in db.Users on report.AssignedStaffId equals handler.Id into handlers
        from handler in handlers.DefaultIfEmpty()
        select new Ticket(report, new(customer.Id, customer.FirstName + " " + customer.LastName, customer.Email!),
            handler == null ? null : new ReportPerson(handler.Id, handler.FirstName + " " + handler.LastName, handler.Email!));

    public Task<Ticket?> FindAsync(Guid id, CancellationToken ct) => Tickets(db.Reports.Where(r => r.Id == id)).SingleOrDefaultAsync(ct);

    public async Task<TicketPage> ListAsync(QueueCriteria criteria, string staffId, CancellationToken ct)
    {
        // Search the JSON address snapshot in PostgreSQL without loading the whole queue.
        var term = "%" + (criteria.Search ?? "").Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
        IQueryable<Report> query = string.IsNullOrEmpty(criteria.Search) ? db.Reports : db.Reports.FromSqlInterpolated($"""
            SELECT r.* FROM reports r JOIN asp_net_users u ON r.customer_id = u.id
            WHERE r.id::text ILIKE {term}
               OR concat_ws(', ', r.address->>'Details', r.address->>'BarangayName', r.address->>'SubMunicipalityName',
                   r.address->>'CityMunicipalityName', r.address->>'ProvinceName', r.address->>'RegionName') ILIKE {term}
               OR (u.first_name || ' ' || u.last_name) ILIKE {term}
               OR (CASE r.issue_type WHEN 'NoWater' THEN 'No water' WHEN 'LowPressure' THEN 'Low pressure' ELSE 'Dirty water' END) ILIKE {term}
            """);
        query = criteria.Tab switch
        {
            "unassigned" => query.Where(r => r.AssignedStaffId == null && r.Status == ReportStatus.Submitted),
            "mine" => query.Where(r => r.AssignedStaffId == staffId),
            "in-progress" => query.Where(r => r.Status == ReportStatus.InProgress),
            _ => query
        };
        if (criteria.Status is not null) { var status = Enum.Parse<ReportStatus>(criteria.Status); query = query.Where(r => r.Status == status); }
        if (criteria.Priority is not null) { var priority = Enum.Parse<ReportPriority>(criteria.Priority); query = query.Where(r => r.Priority == priority); }
        query = criteria.Assignment switch
        {
            "unassigned" => query.Where(r => r.AssignedStaffId == null),
            "mine" => query.Where(r => r.AssignedStaffId == staffId),
            "assigned" => query.Where(r => r.AssignedStaffId != null),
            _ => query
        };
        var count = await query.CountAsync(ct);
        var offset = ((long)criteria.Page - 1) * criteria.PageSize;
        var items = offset >= count ? [] : await Tickets(query.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id)
            .Skip((int)offset).Take(criteria.PageSize)).ToListAsync(ct);
        var summary = new QueueSummary(
            await db.Reports.CountAsync(r => r.Status == ReportStatus.Submitted && r.AssignedStaffId == null, ct),
            await db.Reports.CountAsync(r => r.Status == ReportStatus.InProgress, ct),
            await db.Reports.CountAsync(r => r.Status != ReportStatus.Resolved && r.Priority == ReportPriority.High, ct));
        return new(items, criteria.Page, criteria.PageSize, count, summary);
    }

    public async Task<bool> ClaimAsync(Guid id, string staffId, DateTimeOffset now, CancellationToken ct) =>
        await db.Reports.Where(r => r.Id == id && r.AssignedStaffId == null && r.Status == ReportStatus.Submitted)
            .ExecuteUpdateAsync(setters => setters.SetProperty(r => r.AssignedStaffId, staffId)
                .SetProperty(r => r.ClaimedAt, now).SetProperty(r => r.Status, ReportStatus.InProgress), ct) == 1;

    public async Task<TicketResult<ReportMessage>> WriteAsync(Guid id, Func<Report, TicketResult<ReportMessage>> change, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var report = await db.Reports.FromSqlInterpolated($"SELECT * FROM reports WHERE id = {id} FOR UPDATE").SingleOrDefaultAsync(ct);
        if (report is null) return new(Failure: TicketFailure.NotFound);
        var result = change(report);
        if (!result.Succeeded) return result;
        if (result.Value is not null) db.ReportMessages.Add(result.Value);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return result;
    }

    private IQueryable<TicketMessage> Messages(IQueryable<ReportMessage> messages) =>
        from message in messages
        join sender in db.Users on message.SenderId equals sender.Id
        join membership in db.UserRoles on sender.Id equals membership.UserId
        join role in db.Roles on membership.RoleId equals role.Id
        select new TicketMessage(message.Id, message.ReportId, message.SenderId, sender.FirstName + " " + sender.LastName,
            role.Name!, message.Body, message.CreatedAt);

    public async Task<MessagePage> MessagesAsync(Guid id, long? before, int pageSize, CancellationToken ct)
    {
        var page = await db.ReportMessages.AsNoTracking().Where(m => m.ReportId == id && (before == null || m.Sequence < before))
            .OrderByDescending(m => m.Sequence).Take(pageSize + 1).ToListAsync(ct);
        var hasMore = page.Count > pageSize;
        var selected = page.Take(pageSize).ToList();
        var ids = selected.Select(m => m.Id).ToArray();
        var projected = await Messages(db.ReportMessages.AsNoTracking().Where(m => ids.Contains(m.Id))).ToListAsync(ct);
        var positions = selected.ToDictionary(m => m.Id, m => m.Sequence);
        return new(projected.OrderBy(m => positions[m.Id]).ToList(), hasMore ? selected[^1].Sequence : null);
    }

    public Task<TicketMessage> MessageAsync(Guid messageId, CancellationToken ct) =>
        Messages(db.ReportMessages.AsNoTracking().Where(m => m.Id == messageId)).SingleAsync(ct);
}
