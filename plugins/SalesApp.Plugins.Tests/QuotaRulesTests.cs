using System;
using SalesApp.Plugins;
using Xunit;

namespace SalesApp.Plugins.Tests;

public class QuotaRulesTests
{
    private static readonly Guid Megan = Guid.NewGuid();
    private static readonly Guid Adele = Guid.NewGuid();
    private static readonly Guid Diego = Guid.NewGuid();
    private static readonly DateTime October = new(2026, 10, 1);

    [Fact]
    public void A_manager_may_set_a_direct_reports_Quota()
    {
        Assert.Null(QuotaRules.Check(Megan, Adele, Megan, false, October, 5000m));
    }

    [Fact]
    public void Nobody_sets_their_own_Quota()
    {
        Assert.NotNull(QuotaRules.Check(Adele, Adele, Megan, false, October, 5000m));
        Assert.NotNull(QuotaRules.Check(Megan, Megan, null, true, October, 5000m));
    }

    [Fact]
    public void A_manager_may_not_set_the_Quota_of_someone_elses_report()
    {
        Assert.NotNull(QuotaRules.Check(Megan, Diego, Guid.NewGuid(), false, October, 5000m));
        Assert.NotNull(QuotaRules.Check(Megan, Diego, null, false, October, 5000m));
    }

    [Fact]
    public void Someone_without_a_manager_gets_their_Quota_from_a_system_administrator()
    {
        Assert.Null(QuotaRules.Check(Guid.NewGuid(), Megan, null, true, October, 5000m));
        Assert.NotNull(QuotaRules.Check(Guid.NewGuid(), Megan, null, false, October, 5000m));
    }

    [Fact]
    public void A_system_administrator_is_not_a_manager()
    {
        Assert.NotNull(QuotaRules.Check(Guid.NewGuid(), Adele, Megan, true, October, 5000m));
    }

    [Fact]
    public void The_month_must_be_its_first_day()
    {
        Assert.NotNull(QuotaRules.Check(Megan, Adele, Megan, false, new DateTime(2026, 10, 15), 5000m));
    }

    [Fact]
    public void The_amount_cannot_be_negative()
    {
        Assert.NotNull(QuotaRules.Check(Megan, Adele, Megan, false, October, -1m));
        Assert.Null(QuotaRules.Check(Megan, Adele, Megan, false, October, 0m));
    }
}
