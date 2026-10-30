namespace Aqours.Domain.Features.Updates;

public sealed class PushDeviceToken
{
    public string CustomerId { get; private set; } = null!;
    public string Token { get; private set; } = null!;
    public DateTimeOffset RegisteredAt { get; private set; }
    private PushDeviceToken() { }
    public PushDeviceToken(string customerId, string token, DateTimeOffset registeredAt)
    {
        CustomerId = customerId;
        Token = token;
        RegisteredAt = registeredAt;
    }
}
