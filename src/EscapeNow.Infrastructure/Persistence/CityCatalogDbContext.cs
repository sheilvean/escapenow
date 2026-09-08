using Microsoft.EntityFrameworkCore;

namespace EscapeNow.Infrastructure.Persistence;

public sealed class CityCatalogDbContext(DbContextOptions<CityCatalogDbContext> options)
    : DbContext(options)
{
    internal DbSet<CityRecord> Cities => Set<CityRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("citext");

        modelBuilder.Entity<CityRecord>(entity =>
        {
            entity.ToTable("cities");
            entity.HasKey(e => e.Id).HasName("pk_cities");
            entity.Property(e => e.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(e => e.Name)
                .HasColumnName("name")
                .HasColumnType("citext")
                .IsRequired();
            entity.Property(e => e.Country)
                .HasColumnName("country")
                .HasMaxLength(200)
                .IsRequired();
            entity.Property(e => e.Latitude).HasColumnName("latitude");
            entity.Property(e => e.Longitude).HasColumnName("longitude");
            entity.Property(e => e.ImageUrl)
                .HasColumnName("image_url")
                .HasMaxLength(2000)
                .IsRequired();
            entity.HasIndex(e => e.Name)
                .IsUnique()
                .HasDatabaseName("ix_cities_name");
        });
    }
}
