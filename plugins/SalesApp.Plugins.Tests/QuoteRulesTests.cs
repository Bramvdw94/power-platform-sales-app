using SalesApp.Plugins;
using Xunit;

namespace SalesApp.Plugins.Tests;

public class QuoteRulesTests
{
    [Fact]
    public void VAT_is_computed_per_rate_on_the_net_total_of_that_rate()
    {
        // Three lines of 0.15 at 21% would give 0.03 each (0.0315) = 0.09 per line, but VAT on the net 0.45 is 0.09 too;
        // with 0.14 x 3 the per-line rounding (0.03 x 3 = 0.09) differs from the per-rate rounding (0.42 x 21% = 0.0882 -> 0.09).
        var totals = QuoteRules.Totals(new[] { new QuoteLineAmount(0.14m, 21), new QuoteLineAmount(0.14m, 21), new QuoteLineAmount(0.14m, 21) });
        Assert.Equal(0.42m, totals.Net);
        Assert.Equal(0.09m, totals.Vat21);
        Assert.Equal(0.51m, totals.Gross);
    }

    [Fact]
    public void Each_rate_has_its_own_VAT_and_zero_rate_adds_none()
    {
        var totals = QuoteRules.Totals(new[]
        {
            new QuoteLineAmount(1000m, 21), new QuoteLineAmount(250.55m, 21),
            new QuoteLineAmount(100m, 9), new QuoteLineAmount(75m, 0),
        });
        Assert.Equal(1425.55m, totals.Net);
        Assert.Equal(262.62m, totals.Vat21); // 1250.55 x 21% = 262.6155
        Assert.Equal(9m, totals.Vat9);
        Assert.Equal(1697.17m, totals.Gross);
    }

    [Fact]
    public void A_half_cent_of_VAT_rounds_up()
    {
        var totals = QuoteRules.Totals(new[] { new QuoteLineAmount(0.50m, 9) }); // 0.045
        Assert.Equal(0.05m, totals.Vat9);
    }

    [Fact]
    public void No_lines_give_zero_totals()
    {
        var totals = QuoteRules.Totals(new QuoteLineAmount[0]);
        Assert.Equal(0m, totals.Net);
        Assert.Equal(0m, totals.Gross);
    }

    [Theory]
    [InlineData(1, 2, true)]
    [InlineData(2, 3, true)]
    [InlineData(2, 4, true)]
    [InlineData(2, 5, true)]
    [InlineData(1, 3, false)]
    [InlineData(1, 5, false)]
    [InlineData(2, 1, false)]
    [InlineData(3, 4, false)]
    [InlineData(4, 2, false)]
    [InlineData(5, 1, false)]
    public void Only_Draft_to_Sent_and_Sent_to_a_final_status_are_allowed(int from, int to, bool allowed)
    {
        Assert.Equal(allowed, QuoteRules.CanMove(from, to));
    }
}
