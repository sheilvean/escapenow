using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EscapeNow.Infrastructure.Persistence.Migrations;

/// <inheritdoc />
public partial class InitialCities : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterDatabase()
            .Annotation("Npgsql:PostgresExtension:citext", ",,");

        migrationBuilder.CreateTable(
            name: "cities",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "citext", nullable: false),
                country = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                latitude = table.Column<double>(type: "double precision", nullable: false),
                longitude = table.Column<double>(type: "double precision", nullable: false),
                image_url = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_cities", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_cities_name",
            table: "cities",
            column: "name",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "cities");
    }
}
