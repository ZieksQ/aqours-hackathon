using Aqours.Domain.Features.Updates;

namespace Aqours.Application.Features.Updates;

public interface INotificationReadStore
{
    Task<IReadOnlyList<string>> ListAsync(string customerId, CancellationToken cancellationToken);
    Task MarkAsync(string customerId, IReadOnlyList<string> eventIds, DateTimeOffset readAt, CancellationToken cancellationToken);
}

public sealed class NotificationReadService(INotificationReadStore store, TimeProvider clock)
{
    public Task<IReadOnlyList<string>> ListAsync(string customerId, CancellationToken cancellationToken = default) =>
        store.ListAsync(customerId, cancellationToken);

    public async Task<Dictionary<string, string[]>?> MarkAsync(string customerId, IReadOnlyList<string>? eventIds, CancellationToken cancellationToken = default)
    {
        if (eventIds is null || eventIds.Count is < 1 or > 1000)
            return new() { ["eventIds"] = ["Provide between 1 and 1,000 notification IDs."] };
        if (eventIds.Any(id => string.IsNullOrWhiteSpace(id) || id.Length > 256))
            return new() { ["eventIds"] = ["Notification IDs must contain 1 to 256 characters."] };
        await store.MarkAsync(customerId, eventIds.Distinct(StringComparer.Ordinal).ToArray(), clock.GetUtcNow(), cancellationToken);
        return null;
    }
}

public interface IPushDeviceStore
{
    Task RegisterAsync(string customerId, string token, DateTimeOffset registeredAt, CancellationToken cancellationToken);
    Task RemoveAsync(string customerId, string token, CancellationToken cancellationToken);
}

public sealed class PushDeviceService(IPushDeviceStore store, TimeProvider clock)
{
    public async Task<Dictionary<string, string[]>?> RegisterAsync(string customerId, string? token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 512 || !token.StartsWith("ExponentPushToken[", StringComparison.Ordinal) && !token.StartsWith("ExpoPushToken[", StringComparison.Ordinal))
            return new() { ["token"] = ["Provide a valid Expo push token."] };
        await store.RegisterAsync(customerId, token, clock.GetUtcNow(), cancellationToken);
        return null;
    }
    public Task RemoveAsync(string customerId, string token, CancellationToken cancellationToken = default) => store.RemoveAsync(customerId, token, cancellationToken);
}

public interface IPushNotifications
{
    Task SendToReportCustomerAsync(Guid reportId, string title, string body, CancellationToken cancellationToken = default);
}
