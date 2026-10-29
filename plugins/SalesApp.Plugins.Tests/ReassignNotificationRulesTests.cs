using System;
using SalesApp.Plugins;
using Xunit;

namespace SalesApp.Plugins.Tests;

public class ReassignNotificationRulesTests
{
    private static readonly Guid Adele = Guid.NewGuid();
    private static readonly Guid Alex = Guid.NewGuid();

    [Fact]
    public void Handing_a_record_to_someone_else_notifies_them()
    {
        Assert.True(ReassignNotificationRules.ShouldNotify(Alex, Adele));
    }

    [Fact]
    public void Handing_a_record_to_yourself_notifies_nobody()
    {
        Assert.False(ReassignNotificationRules.ShouldNotify(Adele, Adele));
        Assert.False(ReassignNotificationRules.ShouldNotify(Guid.Empty, Adele));
    }

    [Theory]
    [InlineData("lead", "Adele Vance assigned you the Lead Sanne Bakker.")]
    [InlineData("opportunity", "Adele Vance assigned you the Opportunity Sanne Bakker.")]
    [InlineData("account", "Adele Vance assigned you the Account Sanne Bakker.")]
    [InlineData("contact", "Adele Vance assigned you the Contact Sanne Bakker.")]
    public void The_text_names_who_what_and_which_record(string table, string expected)
    {
        Assert.Equal(expected, ReassignNotificationRules.Text("Adele Vance", table, "Sanne Bakker"));
    }

    [Fact]
    public void A_table_the_app_does_not_open_is_refused()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => ReassignNotificationRules.Text("A", "quote", "B"));
    }

    [Fact]
    public void A_long_text_is_cut_to_the_column_length()
    {
        Assert.Equal(500, ReassignNotificationRules.Fit(new string('x', 900)).Length);
        Assert.Equal("short", ReassignNotificationRules.Fit("short"));
    }
}
