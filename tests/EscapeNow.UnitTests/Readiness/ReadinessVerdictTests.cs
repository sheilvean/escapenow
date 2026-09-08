using EscapeNow.Domain.Readiness;

namespace EscapeNow.UnitTests.Readiness;

public sealed class ReadinessVerdictTests
{
    private static readonly TimeSpan Warmup = TimeSpan.FromSeconds(30);

    [Fact]
    public void Reports_warming_while_inside_the_warmup_window()
    {
        var verdict = ReadinessVerdict.Evaluate(TimeSpan.FromSeconds(5), Warmup, []);

        Assert.Equal(ReadinessState.Warming, verdict.State);
        Assert.Contains("Warming up", verdict.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public void Treats_a_backwards_clock_as_not_yet_warm()
    {
        // A negative uptime means the clock moved backwards. Trusting it would let a process
        // report itself ready on the strength of a bad reading.
        var verdict = ReadinessVerdict.Evaluate(TimeSpan.FromSeconds(-1), TimeSpan.Zero, []);

        Assert.Equal(ReadinessState.Warming, verdict.State);
        Assert.Contains("negative", verdict.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public void Is_ready_at_exactly_the_warmup_boundary()
    {
        var verdict = ReadinessVerdict.Evaluate(Warmup, Warmup, []);

        Assert.Equal(ReadinessState.Ready, verdict.State);
    }

    [Fact]
    public void Is_ready_with_no_dependencies_configured()
    {
        var verdict = ReadinessVerdict.Evaluate(TimeSpan.FromMinutes(1), Warmup, []);

        Assert.Equal(ReadinessState.Ready, verdict.State);
        Assert.Contains("no dependencies configured", verdict.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public void Is_ready_when_every_dependency_answered()
    {
        DependencyReport[] dependencies =
        [
            DependencyReport.Create("queue", isAvailable: true),
            DependencyReport.Create("cache", isAvailable: true),
        ];

        var verdict = ReadinessVerdict.Evaluate(TimeSpan.FromMinutes(1), Warmup, dependencies);

        Assert.Equal(ReadinessState.Ready, verdict.State);
        Assert.Contains("all 2 dependencies", verdict.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public void Is_degraded_when_a_dependency_did_not_answer()
    {
        DependencyReport[] dependencies =
        [
            DependencyReport.Create("queue", isAvailable: true),
            DependencyReport.Create("cache", isAvailable: false),
        ];

        var verdict = ReadinessVerdict.Evaluate(TimeSpan.FromMinutes(1), Warmup, dependencies);

        Assert.Equal(ReadinessState.Degraded, verdict.State);
        Assert.Contains("cache", verdict.Reason, StringComparison.Ordinal);
        Assert.DoesNotContain("queue", verdict.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public void Names_unavailable_dependencies_in_a_stable_order()
    {
        // The reason string ends up in logs and dashboards, so the same failure must render
        // identically regardless of probe ordering.
        DependencyReport[] unordered =
        [
            DependencyReport.Create("zulu", isAvailable: false),
            DependencyReport.Create("alpha", isAvailable: false),
        ];

        var verdict = ReadinessVerdict.Evaluate(TimeSpan.FromMinutes(1), Warmup, unordered);

        Assert.Equal("Unavailable dependencies: alpha, zulu.", verdict.Reason);
    }

    [Fact]
    public void Warming_takes_precedence_over_a_failing_dependency()
    {
        // While warming up, a dependency that has not come up yet is expected, so the
        // verdict must not read as degraded.
        DependencyReport[] dependencies = [DependencyReport.Create("cache", isAvailable: false)];

        var verdict = ReadinessVerdict.Evaluate(TimeSpan.FromSeconds(1), Warmup, dependencies);

        Assert.Equal(ReadinessState.Warming, verdict.State);
    }

    [Fact]
    public void Rejects_a_negative_warmup_period()
    {
        var error = Assert.Throws<ArgumentOutOfRangeException>(
            () => ReadinessVerdict.Evaluate(TimeSpan.Zero, TimeSpan.FromSeconds(-1), []));

        Assert.Equal("warmupPeriod", error.ParamName);
    }

    [Fact]
    public void Rejects_a_null_dependency_collection()
    {
        Assert.Throws<ArgumentNullException>(
            () => ReadinessVerdict.Evaluate(TimeSpan.Zero, TimeSpan.Zero, null!));
    }
}

public sealed class DependencyReportTests
{
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t")]
    public void Rejects_a_name_that_identifies_nothing(string name)
    {
        Assert.Throws<ArgumentException>(() => DependencyReport.Create(name, isAvailable: true));
    }

    [Fact]
    public void Rejects_a_null_name()
    {
        Assert.Throws<ArgumentException>(() => DependencyReport.Create(null!, isAvailable: true));
    }

    [Fact]
    public void Trims_surrounding_whitespace_from_the_name()
    {
        var report = DependencyReport.Create("  queue  ", isAvailable: true);

        Assert.Equal("queue", report.Name);
    }
}
