using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Aqours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ChatMessageAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "report_message_attachments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_name = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    content_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    storage_key = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_report_message_attachments", x => x.id);
                    table.ForeignKey(
                        name: "fk_report_message_attachments_report_messages_message_id",
                        column: x => x.message_id,
                        principalTable: "report_messages",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_report_message_attachments_message_id_position",
                table: "report_message_attachments",
                columns: new[] { "message_id", "position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_report_message_attachments_storage_key",
                table: "report_message_attachments",
                column: "storage_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "report_message_attachments");
        }
    }
}
