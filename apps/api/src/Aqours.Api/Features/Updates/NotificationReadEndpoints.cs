using System.Security.Claims;
using Aqours.Application.Features.Updates;

namespace Aqours.Api.Features.Updates;

public sealed record MarkNotificationsReadRequest(IReadOnlyList<string>? EventIds);
public sealed record PushDeviceRequest(string? Token);

public static class NotificationReadEndpoints
{
    public static void MapNotificationReadEndpoints(this WebApplication app)
    {
        var notifications = app.MapGroup("/api/customer/notifications").RequireAuthorization("Customer");
        notifications.MapGet("/read-state", async (ClaimsPrincipal user, NotificationReadService service, CancellationToken ct) =>
            Results.Ok(new { eventIds = await service.ListAsync(user.FindFirstValue("sub")!, ct) }));
        notifications.MapPost("/read-state", async (MarkNotificationsReadRequest request, ClaimsPrincipal user, NotificationReadService service, CancellationToken ct) =>
        {
            var errors = await service.MarkAsync(user.FindFirstValue("sub")!, request.EventIds, ct);
            return errors is not null ? Results.ValidationProblem(errors) : Results.NoContent();
        });
        notifications.MapPost("/devices", async (PushDeviceRequest request, ClaimsPrincipal user, PushDeviceService service, CancellationToken ct) =>
        {
            var errors = await service.RegisterAsync(user.FindFirstValue("sub")!, request.Token, ct);
            return errors is not null ? Results.ValidationProblem(errors) : Results.NoContent();
        });
        notifications.MapPost("/devices/remove", async (PushDeviceRequest request, ClaimsPrincipal user, PushDeviceService service, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["token"] = ["Token is required."] });
            await service.RemoveAsync(user.FindFirstValue("sub")!, request.Token, ct);
            return Results.NoContent();
        });
    }
}
