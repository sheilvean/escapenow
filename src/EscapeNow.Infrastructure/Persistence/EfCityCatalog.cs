using EscapeNow.Application.Destinations;
using EscapeNow.Domain.Destinations;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace EscapeNow.Infrastructure.Persistence;

public sealed class EfCityCatalog(CityCatalogDbContext db) : ICityCatalog
{
    public async Task<IReadOnlyList<EuropeanCity>> ListAsync(
        CancellationToken cancellationToken = default)
    {
        var rows = await db.Cities
            .AsNoTracking()
            .OrderBy(city => city.Name)
            .ToListAsync(cancellationToken);

        return rows.Select(row => row.ToDomain()).ToList();
    }

    public async Task<EuropeanCity?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var row = await db.Cities
            .AsNoTracking()
            .FirstOrDefaultAsync(city => city.Id == id, cancellationToken);

        return row?.ToDomain();
    }

    public async Task<EuropeanCity?> FindByNameAsync(
        string name,
        CancellationToken cancellationToken = default)
    {
        var row = await db.Cities
            .AsNoTracking()
            .FirstOrDefaultAsync(city => city.Name == name, cancellationToken);

        return row?.ToDomain();
    }

    public async Task AddAsync(EuropeanCity city, CancellationToken cancellationToken = default)
    {
        db.Cities.Add(CityRecord.FromDomain(city));
        await SaveAsync(cancellationToken);
    }

    public async Task UpdateAsync(EuropeanCity city, CancellationToken cancellationToken = default)
    {
        var row = await db.Cities.FirstOrDefaultAsync(existing => existing.Id == city.Id, cancellationToken);
        if (row is null)
        {
            return;
        }

        row.CopyFrom(city);
        await SaveAsync(cancellationToken);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var row = await db.Cities.FirstOrDefaultAsync(city => city.Id == id, cancellationToken);
        if (row is null)
        {
            return false;
        }

        db.Cities.Remove(row);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            throw new DuplicateCityNameException();
        }
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation
        };
}
