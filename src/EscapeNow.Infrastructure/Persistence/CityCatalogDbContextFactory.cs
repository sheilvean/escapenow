using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace EscapeNow.Infrastructure.Persistence;

public sealed class CityCatalogDbContextFactory : IDesignTimeDbContextFactory<CityCatalogDbContext>
{
    public CityCatalogDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("CONNECTIONSTRINGS__ESCAPENOW")
            ?? "Host=localhost;Port=5432;Database=escapenow;Username=escapenow;Password=escapenow";

        var options = new DbContextOptionsBuilder<CityCatalogDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new CityCatalogDbContext(options);
    }
}
