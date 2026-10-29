using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Aqours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class WeatherWarnings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "weather_forecasts",
                columns: table => new
                {
                    site_id = table.Column<Guid>(type: "uuid", nullable: false),
                    latitude = table.Column<double>(type: "double precision", nullable: false),
                    longitude = table.Column<double>(type: "double precision", nullable: false),
                    window_start = table.Column<DateOnly>(type: "date", nullable: false),
                    retrieved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    retry_after = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    days_json = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_weather_forecasts", x => x.site_id);
                    table.ForeignKey(
                        name: "fk_weather_forecasts_supply_sites_site_id",
                        column: x => x.site_id,
                        principalTable: "supply_sites",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "weather_settings",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    heat_threshold_celsius = table.Column<double>(type: "double precision", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_weather_settings", x => x.id);
                    table.CheckConstraint("ck_weather_settings_singleton", "id = 1");
                    table.CheckConstraint("ck_weather_settings_threshold", "heat_threshold_celsius >= 0 AND heat_threshold_celsius <= 60");
                });

            migrationBuilder.InsertData(
                table: "weather_settings",
                columns: new[] { "id", "heat_threshold_celsius", "updated_at" },
                values: new object[] { 1, 35.0, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "weather_forecasts");

            migrationBuilder.DropTable(
                name: "weather_settings");
        }
    }
}
