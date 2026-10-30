using System.Net.Http.Json;
using Aqours.Application.Features.Updates;
using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Aqours.Infrastructure.Features.Updates;

public sealed class ExpoPushNotifications(AqoursDbContext db, ILogger<ExpoPushNotifications> logger) : IPushNotifications
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private sealed record PushMessage(string To, string Title, string Body, object Data, string Sound = "default");
    public async Task SendToReportCustomerAsync(Guid reportId, string title, string body, CancellationToken cancellationToken = default)
    {
        try
        {
            var customerId = await db.Reports.AsNoTracking().Where(report => report.Id == reportId).Select(report => report.CustomerId).SingleOrDefaultAsync(cancellationToken);
            if (customerId is null) return;
            var tokens = await db.PushDeviceTokens.AsNoTracking().Where(device => device.CustomerId == customerId).Select(device => device.Token).ToListAsync(cancellationToken);
            if (tokens.Count == 0) return;
            using var response = await Http.PostAsJsonAsync("https://exp.host/--/api/v2/push/send", tokens.Select(token => new PushMessage(token, title, body, new { reportId })).ToArray(), cancellationToken);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception error)
        {
            logger.LogWarning(error, "Push notification delivery failed for report {ReportId}; the Customer can refresh Updates.", reportId);
        }
    }
}
