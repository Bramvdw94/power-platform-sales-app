using SalesApp.Plugins;
using Xunit;

namespace SalesApp.Plugins.Tests;

public class ProductLineRulesTests
{
    [Theory]
    [InlineData(1, 100, 0, 100)]
    [InlineData(2, 110, 0, 220)]
    [InlineData(1.5, 1450, 0, 2175)]
    [InlineData(3, 99.99, 10, 269.97)]
    [InlineData(1, 0.05, 50, 0.03)]
    [InlineData(1, 0.15, 50, 0.08)]
    [InlineData(3, 33.33, 0, 99.99)]
    [InlineData(1, 100, 100, 0)]
    [InlineData(0.01, 1, 0, 0.01)]
    [InlineData(7, 12.34, 12.5, 75.58)]
    public void Line_amount_is_quantity_times_price_less_discount_rounded_to_cents(double quantity, double price, double discount, double expected)
    {
        Assert.Equal((decimal)expected, ProductLineRules.LineAmount((decimal)quantity, (decimal)price, (decimal)discount));
    }

    [Fact]
    public void The_total_of_rounded_lines_differs_from_the_rounded_total()
    {
        // Three lines of 0.15 at 50% are 0.08 each (0.075 rounds up): 0.24, not 0.23.
        var line = ProductLineRules.LineAmount(1m, 0.15m, 50m);
        Assert.Equal(0.24m, line * 3);
    }

    [Theory]
    [InlineData(1, 10, 0)]
    [InlineData(0.01, 0, 100)]
    public void Allowed_values_pass(double quantity, double price, double discount)
    {
        Assert.Null(ProductLineRules.Check((decimal)quantity, (decimal)price, (decimal)discount));
    }

    [Theory]
    [InlineData(0, 10, 0)]
    [InlineData(-1, 10, 0)]
    [InlineData(0.004, 10, 0)]
    [InlineData(1, -1, 0)]
    [InlineData(1, 10, -0.01)]
    [InlineData(1, 10, 100.01)]
    public void Refused_values_give_a_message(double quantity, double price, double discount)
    {
        Assert.NotNull(ProductLineRules.Check((decimal)quantity, (decimal)price, (decimal)discount));
    }
}
