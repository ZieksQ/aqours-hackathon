using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Features.Weather;
using Aqours.Infrastructure.Features.Weather;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Aqours.Infrastructure.Persistence.Configurations;

public sealed class WeatherSettingsConfiguration : IEntityTypeConfiguration<WeatherSettings>
{
    public void Configure(EntityTypeBuilder<WeatherSettings> builder)
    {
        builder.ToTable("weather_settings", table =>
        {
            table.HasCheckConstraint("ck_weather_settings_singleton", "id = 1");
            table.HasCheckConstraint("ck_weather_settings_threshold", "heat_threshold_celsius >= 0 AND heat_threshold_celsius <= 60");
        });
        builder.HasKey(settings => settings.Id);
        builder.Property(settings => settings.Id).ValueGeneratedNever();
        builder.HasData(new WeatherSettings());
    }
}

public sealed class WeatherForecastConfiguration : IEntityTypeConfiguration<WeatherForecastRecord>
{
    public void Configure(EntityTypeBuilder<WeatherForecastRecord> builder)
    {
        builder.ToTable("weather_forecasts");
        builder.HasKey(forecast => forecast.SiteId);
        builder.HasOne<SupplySite>().WithMany().HasForeignKey(forecast => forecast.SiteId).OnDelete(DeleteBehavior.Cascade);
        builder.Property(forecast => forecast.DaysJson).IsRequired();
    }
}
