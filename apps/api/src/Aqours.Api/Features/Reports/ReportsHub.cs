using Aqours.Application.Features.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Aqours.Api.Features.Reports;

[Authorize]
public sealed class ReportsHub(StaffReportService reports) : Hub
{
    public const string QueueGroup = "report-queue";
    public static string TicketGroup(Guid id) => $"report:{id}";

    public override async Task OnConnectedAsync()
    {
        if (StaffReportEndpoints.Actor(Context.User!).IsPersonnel)
            await Groups.AddToGroupAsync(Context.ConnectionId, QueueGroup);
        await base.OnConnectedAsync();
    }

    public async Task Subscribe(Guid id)
    {
        var access = await reports.DetailsAsync(StaffReportEndpoints.Actor(Context.User!), id, Context.ConnectionAborted);
        if (!access.Succeeded) throw new HubException("Ticket is unavailable.");
        await Groups.AddToGroupAsync(Context.ConnectionId, TicketGroup(id), Context.ConnectionAborted);
    }

    public Task Unsubscribe(Guid id) => Groups.RemoveFromGroupAsync(Context.ConnectionId, TicketGroup(id), Context.ConnectionAborted);
}

public sealed class ReportUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) => connection.User is null ? null : StaffReportEndpoints.Actor(connection.User).Id;
}

// REST is durable; transient notification failures must not turn a committed write into a failed send.
public sealed class ReportNotifications(IHubContext<ReportsHub> hub, ILogger<ReportNotifications> logger) : IReportNotifications
{
    public Task ReportCreatedAsync(Guid id) => DeliverAsync(async () =>
    {
        await hub.Clients.Group(ReportsHub.QueueGroup).SendAsync("ReportCreated", new { id });
        await hub.Clients.Group(ReportsHub.QueueGroup).SendAsync("QueueChanged", new { id });
    });

    public Task TicketUpdatedAsync(Guid id) => DeliverAsync(async () =>
    {
        await hub.Clients.Group(ReportsHub.TicketGroup(id)).SendAsync("TicketUpdated", new { id });
        await hub.Clients.Group(ReportsHub.QueueGroup).SendAsync("QueueChanged", new { id });
    });

    public Task MessageCreatedAsync(TicketMessage message) => DeliverAsync(() =>
        hub.Clients.Group(ReportsHub.TicketGroup(message.ReportId)).SendAsync("MessageCreated", MessageResponse.From(message)));

    private async Task DeliverAsync(Func<Task> deliver)
    {
        try { await deliver(); }
        catch (Exception error) { logger.LogWarning(error, "Report notification failed after commit; clients can recover through REST."); }
    }
}
