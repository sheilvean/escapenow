using EscapeNow.Application.Destinations;

namespace EscapeNow.Api.Endpoints;

public static class CityEndpoints
{
    public static IEndpointRouteBuilder MapCityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/cities").WithTags("Cities");

        group.MapGet("", async (
            ICityCatalogService catalog,
            CancellationToken cancellationToken) =>
        {
            var cities = await catalog.ListAsync(cancellationToken);
            return Results.Ok(cities);
        });

        group.MapPost("", async (
            CityWriteRequest request,
            ICityCatalogService catalog,
            CancellationToken cancellationToken) =>
        {
            var result = await catalog.CreateAsync(request, cancellationToken);
            return MapCreate(result);
        });

        group.MapGet("/{id:guid}", async (
            Guid id,
            ICityCatalogService catalog,
            CancellationToken cancellationToken) =>
        {
            var city = await catalog.GetAsync(id, cancellationToken);
            return city is null ? Results.NotFound() : Results.Ok(city);
        });

        group.MapPut("/{id:guid}", async (
            Guid id,
            CityWriteRequest request,
            ICityCatalogService catalog,
            CancellationToken cancellationToken) =>
        {
            var result = await catalog.ReplaceAsync(id, request, cancellationToken);
            return MapReplace(result);
        });

        group.MapDelete("/{id:guid}", async (
            Guid id,
            ICityCatalogService catalog,
            CancellationToken cancellationToken) =>
        {
            var deleted = await catalog.DeleteAsync(id, cancellationToken);
            return deleted ? Results.NoContent() : Results.NotFound();
        });

        return app;
    }

    private static IResult MapCreate(CityMutationResult result) =>
        result switch
        {
            CityMutationResult.Succeeded succeeded =>
                Results.Created($"/api/cities/{succeeded.City.Id}", succeeded.City),
            CityMutationResult.Invalid invalid => ValidationProblem(invalid.Detail),
            CityMutationResult.DuplicateName => DuplicateNameProblem(),
            _ => UnexpectedProblem()
        };

    private static IResult MapReplace(CityMutationResult result) =>
        result switch
        {
            CityMutationResult.Succeeded succeeded => Results.Ok(succeeded.City),
            CityMutationResult.Invalid invalid => ValidationProblem(invalid.Detail),
            CityMutationResult.DuplicateName => DuplicateNameProblem(),
            CityMutationResult.NotFound => Results.NotFound(),
            _ => UnexpectedProblem()
        };

    private static IResult ValidationProblem(string detail) =>
        Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid city",
            detail: detail);

    private static IResult DuplicateNameProblem() =>
        Results.Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: "City name already exists",
            detail: "A city with that name already exists.");

    private static IResult UnexpectedProblem() =>
        Results.Problem(
            statusCode: StatusCodes.Status500InternalServerError,
            title: "Unexpected city mutation result");
}
