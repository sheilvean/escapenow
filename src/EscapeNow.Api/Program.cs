using System.IO;
using EscapeNow.Api.Endpoints;
using EscapeNow.Application.Abstractions;
using EscapeNow.Application.Destinations;
using EscapeNow.Infrastructure.Weather;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// --- Composition -------------------------------------------------------------------
// EscapeNow has no dependency to probe: the forecast API is called per request and a failure
// there is a request failure, not an unhealthy process. So no health check is registered, and
// both endpoints report healthy while the process is running. Adding a real check later is a
// registration here, not a new port in the inner layers.
builder.Services.AddHealthChecks();

builder.Services.AddHttpClient<IWeatherService, OpenMeteoWeatherService>(client =>
{
    client.BaseAddress = new Uri("https://api.open-meteo.com/");
    client.Timeout = TimeSpan.FromSeconds(15);
});

builder.Services.AddScoped<IDestinationRecommendationService, DestinationRecommendationService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins(
                "http://localhost:4200",
                "http://127.0.0.1:4200")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

builder.Services.AddProblemDetails(options =>
    options.CustomizeProblemDetails = context =>
        context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors("Frontend");

// A load balancer routes on the status code, so the response body is deliberately not a
// contract here.
app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready");

app.MapDestinationEndpoints();

var frontendRoot = Path.GetFullPath(
    Path.Combine(app.Environment.ContentRootPath, "..", "..", "frontend", "dist", "frontend", "browser"));

// The integration host uses the Testing environment; serving the SPA fallback there would turn
// every unknown path into index.html and mask the 404 ProblemDetails contract under test.
if (!app.Environment.IsEnvironment("Testing") && Directory.Exists(frontendRoot))
{
    var frontendFiles = new PhysicalFileProvider(frontendRoot);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = frontendFiles });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = frontendFiles });
    app.MapFallbackToFile("index.html", new StaticFileOptions { FileProvider = frontendFiles });
}

app.Run();
