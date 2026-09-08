using System.IO;
using EscapeNow.Api.Endpoints;
using EscapeNow.Application.Abstractions;
using EscapeNow.Application.Destinations;
using EscapeNow.Application.Readiness;
using EscapeNow.Infrastructure.Readiness;
using EscapeNow.Infrastructure.Weather;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// --- Configuration -----------------------------------------------------------------
builder.Services
    .AddOptions<ReadinessOptions>()
    .Bind(builder.Configuration.GetSection(ReadinessOptions.SectionName))
    .Validate(
        static o => o.WarmupPeriod >= TimeSpan.Zero,
        $"{ReadinessOptions.SectionName}:WarmupPeriod cannot be negative.")
    .Validate(
        static o => o.ProbeTimeout >= TimeSpan.Zero,
        $"{ReadinessOptions.SectionName}:ProbeTimeout cannot be negative.")
    .ValidateOnStart();

builder.Services.AddSingleton(static sp => sp.GetRequiredService<IOptions<ReadinessOptions>>().Value);

// --- Composition -------------------------------------------------------------------
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddSingleton<IProcessStartTime, ProcessStartTime>();
builder.Services.AddSingleton<IDependencyProbe, NoDependencyProbe>();
builder.Services.AddScoped<ReadinessService>();

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

app.MapHealthEndpoints();
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
