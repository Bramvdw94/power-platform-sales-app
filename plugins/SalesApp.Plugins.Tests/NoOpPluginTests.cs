using Microsoft.Xrm.Sdk;
using SalesApp.Plugins;
using Xunit;

namespace SalesApp.Plugins.Tests;

public class NoOpPluginTests
{
    [Fact]
    public void Is_a_Dataverse_plugin()
    {
        Assert.IsAssignableFrom<IPlugin>(new NoOpPlugin("", ""));
    }

    [Fact]
    public void Execute_without_a_service_provider_is_rejected()
    {
        Assert.Throws<InvalidPluginExecutionException>(() => new NoOpPlugin("", "").Execute(null!));
    }
}
