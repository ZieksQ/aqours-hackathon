using Aqours.Application.Features.Weather;
using Aqours.Infrastructure.Features.Weather;
using Aqours.Application.Locations;
using Aqours.Application.Features.Map;
using Aqours.Infrastructure.Features.Map;
using Aqours.Infrastructure.Locations;
using Aqours.Application.Features.SupplySites;
using Aqours.Infrastructure.Features.SupplySites;
using Aqours.Infrastructure.Persistence;
using Aqours.Infrastructure.Features.Reports;
using Aqours.Application.Features.Reports;
using Aqours.Infrastructure.Persistence.Seeders;
using Aqours.Infrastructure.Features.Accounts;
using Aqours.Application.Features.Updates;
using Aqours.Infrastructure.Features.Updates;
using Aqours.Application.Features.Accounts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Aqours.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddDbContextFactory<AqoursDbContext>(options =>
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
        services.AddSingleton<IPsgcAddresses, PsgcAddresses>();
        services.AddScoped<IReportStore, PostgresReportStore>();
        services.AddScoped<ISupplierMapStore, PostgresSupplierMapStore>();
        services.AddScoped<SupplierMapService>();
        services.AddScoped<ReportService>();
        services.AddScoped<ISupplySiteStore, PostgresSupplySiteStore>();
        services.AddScoped<SupplySiteService>();
        services.AddScoped<ISupplyMonitoringStore, PostgresSupplyMonitoringStore>();
        services.AddScoped<IWeatherStore, PostgresWeatherStore>();
        services.AddScoped<WeatherService>();
        services.AddSingleton<WeatherRefreshCoordinator>();
        services.AddSingleton<IWeatherForecastProvider>(provider => new OpenMeteoForecastProvider(
            new HttpClient(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(5) })
            { Timeout = TimeSpan.FromSeconds(10) }, provider.GetRequiredService<ILogger<OpenMeteoForecastProvider>>()));
        services.AddScoped<SupplyMonitoringService>();
        services.AddScoped<IStaffReportStore, PostgresStaffReportStore>();
        services.AddScoped<StaffReportService>();
        services.AddScoped<IAccountStore, IdentityAccountStore>();
        services.AddScoped<AccountService>();
        services.AddScoped<IRefreshSessions, PostgresRefreshSessions>();
        services.AddScoped<INotificationReadStore, PostgresNotificationReadStore>();
        services.AddScoped<NotificationReadService>();
        services.AddScoped<IPushDeviceStore, PostgresPushDeviceStore>();
        services.AddScoped<PushDeviceService>();
        services.AddScoped<IPushNotifications, ExpoPushNotifications>();
        services.AddScoped<IAccountSeeder, AccountSeeder>();
        return services;
    }
}
