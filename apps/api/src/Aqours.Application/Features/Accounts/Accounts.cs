using System.ComponentModel.DataAnnotations;
using Aqours.Domain.Features.Accounts;

namespace Aqours.Application.Features.Accounts;

// Internal session data never crosses the HTTP response boundary.
public sealed record AccountSession(Account Account, string SecurityStamp);
public sealed record CreateAccount(string Email, string FirstName, string? MiddleName,
    string LastName, string InitialPassword, string Role);
public sealed record Outcome<T>(T? Value, Dictionary<string, string[]>? Errors = null, bool Unauthorized = false)
{
    public bool Succeeded => Value is not null;
    public static Outcome<T> Invalid(string field, string message) => new(default, new() { [field] = [message] });
    public static Outcome<T> Denied() => new(default, Unauthorized: true);
}
public sealed record RefreshSession(AccountSession Session, string Token, DateTimeOffset ExpiresAt);

public interface IAccountStore
{
    Task<AccountSession?> AuthenticateAsync(string email, string password);
    Task<AccountSession?> FindAsync(string id);
    Task<Outcome<AccountSession>> CreateAsync(CreateAccount account);
    Task<Outcome<AccountSession>> ChangePasswordAsync(string id, string currentPassword, string newPassword);
}
public interface IRefreshSessions
{
    Task<RefreshSession> CreateAsync(AccountSession session);
    Task<RefreshSession?> RotateAsync(string token);
    Task RevokeAsync(string token);
}
public interface IAccountSeeder
{
    Task SeedAsync();
}

public sealed class AccountService(IAccountStore store)
{
    public async Task<Outcome<AccountSession>> LoginAsync(string? email, string? password, bool mobile)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrEmpty(password) || email.Length > 256 || password.Length > 256)
            return Outcome<AccountSession>.Denied();
        var session = await store.AuthenticateAsync(email.Trim(), password);
        if (session is null || (mobile ? session.Account.Role != AccountRoles.Customer :
            session.Account.Role is not (AccountRoles.Admin or AccountRoles.Staff)))
            return Outcome<AccountSession>.Denied();
        return new(session);
    }

    public Task<AccountSession?> FindAsync(string id) => store.FindAsync(id);

    public Task<Outcome<AccountSession>> CreateAsync(CreateAccount account)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(account.Email) || account.Email.Length > 256 ||
            !new EmailAddressAttribute().IsValid(account.Email.Trim())) errors["email"] = ["Enter a valid email address (up to 256 characters)."];
        if (string.IsNullOrWhiteSpace(account.FirstName) || account.FirstName.Length > 100) errors["firstName"] = ["First name is required (up to 100 characters)."];
        if (string.IsNullOrWhiteSpace(account.LastName) || account.LastName.Length > 100) errors["lastName"] = ["Last name is required (up to 100 characters)."];
        if (account.MiddleName?.Length > 100) errors["middleName"] = ["Use up to 100 characters."];
        if (!AccountRoles.All.Contains(account.Role)) errors["role"] = ["Choose Admin, Staff, or Customer."];
        if (string.IsNullOrEmpty(account.InitialPassword) || account.InitialPassword.Length > 256) errors["initialPassword"] = ["An initial password is required (up to 256 characters)."];
        if (errors.Count > 0) return Task.FromResult(new Outcome<AccountSession>(null, errors));
        return store.CreateAsync(account with
        {
            Email = account.Email.Trim(),
            FirstName = account.FirstName.Trim(),
            LastName = account.LastName.Trim(),
            MiddleName = string.IsNullOrWhiteSpace(account.MiddleName) ? null : account.MiddleName.Trim()
        });
    }

    public Task<Outcome<AccountSession>> ChangePasswordAsync(string id, string? current, string? next)
    {
        if (string.IsNullOrEmpty(current) || string.IsNullOrEmpty(next) || current.Length > 256 || next.Length > 256)
            return Task.FromResult(Outcome<AccountSession>.Invalid("newPassword", "Both passwords are required (up to 256 characters)."));
        if (current == next) return Task.FromResult(Outcome<AccountSession>.Invalid("newPassword", "Choose a different password."));
        return store.ChangePasswordAsync(id, current, next);
    }
}
