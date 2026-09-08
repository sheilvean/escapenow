using System.Diagnostics;
using EscapeNow.Application.Abstractions;
using EscapeNow.Application.Readiness;
using EscapeNow.Domain.Readiness;

namespace EscapeNow.UnitTests.Readiness;

public sealed class ReadinessServiceTests
{
    private static readonly DateTimeOffset Start = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Computes_uptime_from_the_clock_and_the_process_start_time()
    {
        var service = Build(
            now: Start + TimeSpan.FromSeconds(10),
            warmup: TimeSpan.FromSeconds(30),
            probe: new StubProbe([]));

        var verdict = await service.EvaluateAsync(TestContext.Current.CancellationToken);

        Assert.Equal(ReadinessState.Warming, verdict.State);
        Assert.Contains("10s of 30s", verdict.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Passes_dependency_reports_through_to_the_domain_rule()
    {
        var service = Build(
            now: Start + TimeSpan.FromMinutes(1),
            warmup: TimeSpan.Zero,
            probe: new StubProbe([DependencyReport.Create("cache", isAvailable: false)]));

        var verdict = await service.EvaluateAsync(TestContext.Current.CancellationToken);

        Assert.Equal(ReadinessState.Degraded, verdict.State);
    }

    [Fact]
    public async Task Reports_a_timed_out_probe_as_unavailable_rather_than_healthy()
    {
        // An unknown dependency state must never read as a working one.
        var service = Build(
            now: Start + TimeSpan.FromMinutes(1),
            warmup: TimeSpan.Zero,
            probe: new HangingProbe(),
            probeTimeout: TimeSpan.FromMilliseconds(20));

        var verdict = await service.EvaluateAsync(TestContext.Current.CancellationToken);

        Assert.Equal(ReadinessState.Degraded, verdict.State);
        Assert.Contains("dependency-probe", verdict.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Propagates_cancellation_from_the_caller()
    {
        // The caller giving up is not the same as a dependency being down, so the service must
        // not turn it into a verdict.
        var service = Build(
            now: Start + TimeSpan.FromMinutes(1),
            warmup: TimeSpan.Zero,
            probe: new HangingProbe(),
            probeTimeout: TimeSpan.FromSeconds(30));

        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            async () => await service.EvaluateAsync(cancelled.Token));
    }

    [Fact]
    public async Task Skips_the_timeout_wrapper_when_the_timeout_is_zero()
    {
        var probe = new StubProbe([DependencyReport.Create("queue", isAvailable: true)]);
        var service = Build(
            now: Start + TimeSpan.FromMinutes(1),
            warmup: TimeSpan.Zero,
            probe: probe,
            probeTimeout: TimeSpan.Zero);

        var verdict = await service.EvaluateAsync(TestContext.Current.CancellationToken);

        Assert.Equal(ReadinessState.Ready, verdict.State);
        Assert.Equal(1, probe.Calls);
    }

    private static ReadinessService Build(
        DateTimeOffset now,
        TimeSpan warmup,
        IDependencyProbe probe,
        TimeSpan? probeTimeout = null) =>
        new(
            new FixedClock(now),
            new FixedStartTime(Start),
            probe,
            new ReadinessOptions
            {
                WarmupPeriod = warmup,
                ProbeTimeout = probeTimeout ?? TimeSpan.FromSeconds(2),
            });

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow => now;
    }

    private sealed class FixedStartTime(DateTimeOffset startedAt) : IProcessStartTime
    {
        public DateTimeOffset StartedAtUtc => startedAt;
    }

    private sealed class StubProbe(IReadOnlyCollection<DependencyReport> reports) : IDependencyProbe
    {
        public int Calls { get; private set; }

        public ValueTask<IReadOnlyCollection<DependencyReport>> ProbeAsync(
            CancellationToken cancellationToken)
        {
            Calls++;
            cancellationToken.ThrowIfCancellationRequested();
            return ValueTask.FromResult(reports);
        }
    }

    private sealed class HangingProbe : IDependencyProbe
    {
        public async ValueTask<IReadOnlyCollection<DependencyReport>> ProbeAsync(
            CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.Infinite, cancellationToken).ConfigureAwait(false);
            throw new UnreachableException();
        }
    }
}
