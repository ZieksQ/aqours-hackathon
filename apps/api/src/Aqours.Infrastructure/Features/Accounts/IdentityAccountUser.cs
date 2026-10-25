using Microsoft.AspNetCore.Identity;

namespace Aqours.Infrastructure.Features.Accounts;

public sealed class IdentityAccountUser : IdentityUser
{
    public required string FirstName { get; set; }
    public string? MiddleName { get; set; }
    public required string LastName { get; set; }
    public bool RequiresPasswordChange { get; set; } = true;
}

public sealed class RefreshFamily
{
    public Guid Id { get; set; }
    public required string UserId { get; set; }
    public required string SecurityStamp { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public bool Revoked { get; set; }
}
public sealed class RefreshToken
{
    public required string Hash { get; set; }
    public Guid FamilyId { get; set; }
    public bool Consumed { get; set; }
}
