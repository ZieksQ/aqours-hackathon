using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Aqours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CustomerNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "notification_reads",
                columns: table => new
                {
                    customer_id = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    event_id = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    read_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_reads", x => new { x.customer_id, x.event_id });
                    table.ForeignKey(
                        name: "fk_notification_reads_asp_net_users_customer_id",
                        column: x => x.customer_id,
                        principalTable: "asp_net_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "push_device_tokens",
                columns: table => new
                {
                    customer_id = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    token = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    registered_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_push_device_tokens", x => new { x.customer_id, x.token });
                    table.ForeignKey(
                        name: "fk_push_device_tokens_asp_net_users_customer_id",
                        column: x => x.customer_id,
                        principalTable: "asp_net_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_reads");

            migrationBuilder.DropTable(
                name: "push_device_tokens");
        }
    }
}
