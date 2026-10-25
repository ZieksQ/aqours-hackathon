namespace Aqours.Domain.Features.Accounts;

public static class AccountRoles
{
    public const string Admin = "Admin", Staff = "Staff", Customer = "Customer";
    public static readonly IReadOnlyList<string> All = Array.AsReadOnly(new[] { Admin, Staff, Customer });
}

// The account is a domain entity; Identity storage and credentials are separate infrastructure concerns.
public sealed record Account
{
    public string Id { get; }
    public string Email { get; }
    public string FirstName { get; }
    public string? MiddleName { get; }
    public string LastName { get; }
    public string Role { get; }
    public bool RequiresPasswordChange { get; }

    public Account(string id, string email, string firstName, string? middleName, string lastName,
        string role, bool requiresPasswordChange)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        ArgumentException.ThrowIfNullOrWhiteSpace(firstName);
        ArgumentException.ThrowIfNullOrWhiteSpace(lastName);
        if (!AccountRoles.All.Contains(role)) throw new ArgumentException("An account must have exactly one supported role.", nameof(role));
        Id = id;
        Email = email;
        FirstName = firstName;
        MiddleName = middleName;
        LastName = lastName;
        Role = role;
        RequiresPasswordChange = requiresPasswordChange;
    }
}
