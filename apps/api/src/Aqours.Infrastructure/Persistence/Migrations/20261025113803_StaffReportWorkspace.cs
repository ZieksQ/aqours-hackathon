using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Aqours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StaffReportWorkspace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "assigned_staff_id",
                table: "reports",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "claimed_at",
                table: "reports",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "priority",
                table: "reports",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Normal");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "resolved_at",
                table: "reports",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "report_messages",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    report_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sender_id = table.Column<string>(type: "text", nullable: false),
                    body = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_messages", x => x.id);
                    table.ForeignKey(
                        name: "fk_report_messages_asp_net_users_sender_id",
                        column: x => x.sender_id,
                        principalTable: "asp_net_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_report_messages_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_reports_assigned_staff_id",
                table: "reports",
                column: "assigned_staff_id");

            migrationBuilder.CreateIndex(
                name: "ix_reports_status_created_at_id",
                table: "reports",
                columns: new[] { "status", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_report_messages_report_id_sequence",
                table: "report_messages",
                columns: new[] { "report_id", "sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_report_messages_sender_id",
                table: "report_messages",
                column: "sender_id");

            migrationBuilder.AddForeignKey(
                name: "fk_reports_asp_net_users_assigned_staff_id",
                table: "reports",
                column: "assigned_staff_id",
                principalTable: "asp_net_users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_reports_asp_net_users_assigned_staff_id",
                table: "reports");

            migrationBuilder.DropTable(
                name: "report_messages");

            migrationBuilder.DropIndex(
                name: "ix_reports_assigned_staff_id",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_reports_status_created_at_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "assigned_staff_id",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "claimed_at",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "priority",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "resolved_at",
                table: "reports");
        }
    }
}
