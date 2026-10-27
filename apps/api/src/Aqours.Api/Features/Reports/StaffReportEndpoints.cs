using Aqours.Api.Locations;
using System.Security.Claims;
using Aqours.Api.Features.Accounts;
using Aqours.Application.Features.Reports;

namespace Aqours.Api.Features.Reports;

public sealed record PriorityRequest(string? Priority);
public sealed record StatusRequest(string? Status);
public sealed record MessageRequest(string? Body);
public sealed record TicketResponse(Guid Id, string Title, string Description, AddressResponse Address, double Latitude,
    double Longitude, string Status, string Priority, DateTimeOffset CreatedAt, DateTimeOffset? ClaimedAt,
    DateTimeOffset? ResolvedAt, ReportPerson Customer, ReportPerson? AssignedStaff, string SupplierName)
{
    public static TicketResponse From(Ticket ticket)
    {
        var r = ticket.Report;
        var basic = ReportResponse.From(r);
        return new(r.Id, r.IssueType switch { Domain.Features.Reports.IssueType.NoWater => "No water", Domain.Features.Reports.IssueType.LowPressure => "Low pressure", _ => "Dirty water" },
            r.Description, basic.Address, r.Latitude, r.Longitude, r.Status.ToString(), r.Priority.ToString(), r.CreatedAt,
            r.ClaimedAt, r.ResolvedAt, ticket.Customer, ticket.AssignedStaff, "Supplier organization");
    }
}
public sealed record TicketPageResponse(IReadOnlyList<TicketResponse> Items, int Page, int PageSize, int TotalCount, QueueSummary Summary);
public sealed record MessageResponse(Guid Id, Guid ReportId, string SenderId, string SenderName, string SenderRole, string Body, DateTimeOffset CreatedAt)
{
    public static MessageResponse From(TicketMessage message) => new(message.Id, message.ReportId, message.SenderId,
        message.SenderName, message.SenderRole, message.Body, message.CreatedAt);
}
public sealed record MessagePageResponse(IReadOnlyList<MessageResponse> Items, long? NextBefore);

public static class StaffReportEndpoints
{
    public static ReportActor Actor(ClaimsPrincipal user) => new(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier)!,
        user.FindFirstValue("role") ?? user.FindFirstValue(ClaimTypes.Role)!);

    public static void MapStaffReportEndpoints(this WebApplication app)
    {
        var staff = app.MapGroup("/api/staff/reports").RequireAuthorization("Personnel");
        staff.MapGet("", async (ClaimsPrincipal user, StaffReportService service, CancellationToken ct,
            string tab = "unassigned", string? search = null, string? status = null, string? priority = null,
            string? assignment = null, int page = 1, int pageSize = 20) =>
        {
            var result = await service.QueueAsync(Actor(user), new(tab, search, status, priority, assignment, page, pageSize), ct);
            if (!result.Succeeded) return Failure(result);
            var value = result.Value!;
            return Results.Ok(new TicketPageResponse(value.Items.Select(TicketResponse.From).ToList(), value.Page, value.PageSize, value.TotalCount, value.Summary));
        });
        staff.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, StaffReportService service, CancellationToken ct) =>
        {
            var result = await service.DetailsAsync(Actor(user), id, ct);
            return result.Succeeded ? Results.Ok(TicketResponse.From(result.Value!)) : Failure(result);
        });
        staff.MapPost("/{id:guid}/claim", async (Guid id, ClaimsPrincipal user, StaffReportService service, CancellationToken ct) =>
        {
            var result = await service.ClaimAsync(Actor(user), id, ct);
            return result.Succeeded ? Results.Ok(TicketResponse.From(result.Value!)) : Failure(result);
        }).AddEndpointFilter<CsrfFilter>();
        staff.MapPost("/{id:guid}/priority", async (Guid id, PriorityRequest request, ClaimsPrincipal user, StaffReportService service, CancellationToken ct) =>
        {
            var result = await service.ChangeAsync(Actor(user), id, request.Priority, null, ct);
            return result.Succeeded ? Results.Ok(TicketResponse.From(result.Value!)) : Failure(result);
        }).AddEndpointFilter<CsrfFilter>();
        staff.MapPost("/{id:guid}/status", async (Guid id, StatusRequest request, ClaimsPrincipal user, StaffReportService service, CancellationToken ct) =>
        {
            var result = await service.ChangeAsync(Actor(user), id, null, request.Status, ct);
            return result.Succeeded ? Results.Ok(TicketResponse.From(result.Value!)) : Failure(result);
        }).AddEndpointFilter<CsrfFilter>();
        MapMessages(staff, true);
        MapMessages(app.MapGroup("/api/reports").RequireAuthorization("Customer"), false);
    }

    private static void MapMessages(RouteGroupBuilder group, bool staff)
    {
        group.MapGet("/{id:guid}/messages", async (Guid id, ClaimsPrincipal user, StaffReportService service, CancellationToken ct, long? before = null, int pageSize = 50) =>
        {
            var result = await service.HistoryAsync(Actor(user), id, before, pageSize, ct);
            return result.Succeeded ? Results.Ok(new MessagePageResponse(result.Value!.Items.Select(MessageResponse.From).ToList(), result.Value.NextBefore)) : Failure(result);
        });
        var send = group.MapPost("/{id:guid}/messages", async (Guid id, MessageRequest request, ClaimsPrincipal user, StaffReportService service, CancellationToken ct) =>
        {
            var result = await service.SendAsync(Actor(user), id, request.Body, ct);
            return result.Succeeded ? Results.Ok(MessageResponse.From(result.Value!)) : Failure(result);
        });
        if (staff) send.AddEndpointFilter<CsrfFilter>();
    }

    private static IResult Failure<T>(TicketResult<T> result) => result.Failure switch
    {
        TicketFailure.Forbidden => Results.Forbid(),
        TicketFailure.NotFound => Results.NotFound(),
        TicketFailure.Conflict => Results.Conflict(new { detail = result.Error }),
        _ => Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = [result.Error ?? "Invalid request."] })
    };
}
