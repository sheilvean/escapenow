using EscapeNow.ArchitectureTests.Support;
using ArchUnitNET.Domain;
using ArchUnitNET.Fluent;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

namespace EscapeNow.ArchitectureTests;

/// <summary>
/// Layer direction, checked against compiled dependencies.
///
/// Two complementary mechanisms are used, because neither alone is sufficient:
/// intra-solution direction goes through ArchUnitNET at type level (every participating
/// assembly is loaded, so the selection is real), while framework leakage goes through the
/// compiled assembly reference list (a rule about types in an assembly that was never loaded
/// would be satisfied vacuously). Declared-but-unused project references are covered
/// separately by <see cref="ProjectReferenceRulesTests"/>.
///
/// These rules apply under the <c>layered</c> profile. Under <c>custom</c> they report
/// themselves skipped — visible as "not applicable" in the test report, never as a pass —
/// while the cycle and module-registry rules keep running.
/// </summary>
public sealed class LayerRulesTests
{
    private const string ProfileSkipReason =
        "architecture.profile is not \"layered\", so the layer-direction rules do not apply. " +
        "The cycle and module-registry rules still run.";

    private static readonly IObjectProvider<IType> DomainTypes =
        Types().That().ResideInAssembly(ArchitectureFacts.Domain).As("types in Domain");

    private static readonly IObjectProvider<IType> ApplicationTypes =
        Types().That().ResideInAssembly(ArchitectureFacts.Application).As("types in Application");

    private static readonly IObjectProvider<IType> InfrastructureTypes =
        Types().That().ResideInAssembly(ArchitectureFacts.Infrastructure).As("types in Infrastructure");

    private static readonly IObjectProvider<IType> ApiTypes =
        Types().That().ResideInAssembly(ArchitectureFacts.Api).As("types in Api");

    [Fact]
    public void Domain_does_not_depend_on_any_outer_layer()
    {
        Assert.SkipUnless(ArchitectureProfiles.LayerRulesApply, ProfileSkipReason);

        RuleGuard.Check(
            DomainTypes,
            Types().That().ResideInAssembly(ArchitectureFacts.Domain)
                .Should().NotDependOnAny(ApplicationTypes)
                .AndShould().NotDependOnAny(InfrastructureTypes)
                .AndShould().NotDependOnAny(ApiTypes)
                .Because("Domain holds the rules and must be usable without the layers around it."),
            "types in Domain");
    }

    [Fact]
    public void Application_does_not_depend_on_infrastructure_or_the_host()
    {
        Assert.SkipUnless(ArchitectureProfiles.LayerRulesApply, ProfileSkipReason);

        RuleGuard.Check(
            ApplicationTypes,
            Types().That().ResideInAssembly(ArchitectureFacts.Application)
                .Should().NotDependOnAny(InfrastructureTypes)
                .AndShould().NotDependOnAny(ApiTypes)
                .Because("Application declares ports; Infrastructure implements them, not the reverse."),
            "types in Application");
    }

    [Fact]
    public void Infrastructure_does_not_depend_on_the_host()
    {
        Assert.SkipUnless(ArchitectureProfiles.LayerRulesApply, ProfileSkipReason);

        RuleGuard.Check(
            InfrastructureTypes,
            Types().That().ResideInAssembly(ArchitectureFacts.Infrastructure)
                .Should().NotDependOnAny(ApiTypes)
                .Because("The host composes Infrastructure; Infrastructure knows nothing about it."),
            "types in Infrastructure");
    }

    [Fact]
    public void Domain_is_free_of_framework_dependencies()
    {
        Assert.SkipUnless(ArchitectureProfiles.LayerRulesApply, ProfileSkipReason);

        // Proves the check has real input before judging it.
        Assert.NotEmpty(AssemblyReferenceRules.ReferencedNames(ArchitectureFacts.Domain));

        var violations = AssemblyReferenceRules.FindForbiddenReferences(
            ArchitectureFacts.Domain,
            LayeredProfile.ForbiddenInDomain);

        Assert.True(
            violations.Count == 0,
            "Domain must stay free of framework dependencies so the rules can be used and " +
            "unit-tested without a web server, an ORM or a host:" +
            Environment.NewLine + string.Join(Environment.NewLine, violations));
    }

    [Fact]
    public void Application_is_free_of_framework_dependencies()
    {
        Assert.SkipUnless(ArchitectureProfiles.LayerRulesApply, ProfileSkipReason);

        Assert.NotEmpty(AssemblyReferenceRules.ReferencedNames(ArchitectureFacts.Application));

        var violations = AssemblyReferenceRules.FindForbiddenReferences(
            ArchitectureFacts.Application,
            LayeredProfile.ForbiddenInApplication);

        Assert.True(
            violations.Count == 0,
            "Application orchestrates through its own ports and takes options as plain objects, " +
            "so it needs neither a container nor the configuration abstractions:" +
            Environment.NewLine + string.Join(Environment.NewLine, violations));
    }

    [Fact]
    public void Endpoints_go_through_application_rather_than_reaching_for_adapters()
    {
        // This is how "business logic does not live in endpoints" is made checkable. An endpoint
        // that talks to an adapter directly has bypassed the port, and that is the shape logic
        // takes when it leaks into the HTTP layer. Only the composition root may name an adapter.
        Assert.SkipUnless(ArchitectureProfiles.LayerRulesApply, ProfileSkipReason);

        // Namespaces follow rootNamespace, assembly names follow solutionName. They are equal in
        // the template's default configuration; the config check fails if they are made to differ
        // without the projects declaring an explicit RootNamespace.
        var endpointNamespace =
            $"{RepositoryLayout.Config.RootNamespace}.{LayeredProfile.Api}.Endpoints";

        var endpointTypes = Types().That()
            .ResideInAssembly(ArchitectureFacts.Api)
            .And().ResideInNamespace(endpointNamespace)
            .As($"types in {endpointNamespace}");

        RuleGuard.Check(
            endpointTypes,
            Types().That()
                .ResideInAssembly(ArchitectureFacts.Api)
                .And().ResideInNamespace(endpointNamespace)
                .Should().NotDependOnAny(InfrastructureTypes)
                .Because("Endpoints depend on Application ports; only the composition root " +
                         "knows which adapter implements them."),
            $"types in {endpointNamespace}");
    }
}
