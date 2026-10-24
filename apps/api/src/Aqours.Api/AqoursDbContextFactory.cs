using Aqours.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Aqours.Api;

// EF tooling must not run the application's schema check/seeder before migrations exist.
public sealed class AqoursDbContextFactory : IDesignTimeDbContextFactory<AqoursDbContext>
{
    public AqoursDbContext CreateDbContext(string[] args)
    {
        var config = new ConfigurationBuilder().AddUserSecrets<Program>(optional: true).AddEnvironmentVariables().Build();
        var connection = config.GetConnectionString("Aqours") ?? throw new InvalidOperationException(
            "Configure ConnectionStrings:Aqours in user secrets or ConnectionStrings__Aqours for EF migration commands. See docs/authentication.md.");
        return new(new DbContextOptionsBuilder<AqoursDbContext>().UseNpgsql(connection).UseSnakeCaseNamingConvention().Options);
    }
}
