using Aqours.Infrastructure.Persistence;
using Aqours.Infrastructure.Persistence.Seeders;
using Aqours.Infrastructure.Features.Accounts;
using Aqours.Application.Features.Accounts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Aqours.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddDbContext<AqoursDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString("Aqours");
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    "Configure ConnectionStrings:Aqours using environment variables or .NET user secrets.");
            }

            options.UseNpgsql(connectionString)
                .UseSnakeCaseNamingConvention();
        });

        services.AddIdentityCore<IdentityAccountUser>(options =>
        {
            options.User.RequireUniqueEmail = true;
            options.Password.RequiredLength = 12;
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        }).AddRoles<IdentityRole>().AddEntityFrameworkStores<AqoursDbContext>();
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<IAccountStore, IdentityAccountStore>();
        services.AddScoped<AccountService>();
        services.AddScoped<IRefreshSessions, PostgresRefreshSessions>();
        services.AddScoped<IAccountSeeder, AccountSeeder>();
        return services;
    }
}
