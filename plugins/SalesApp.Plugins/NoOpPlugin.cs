using System;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Placeholder step so the package can be registered in dev-salesapp before the
    /// process engine exists. Does nothing; replaced by the generic engine plug-in.
    /// </summary>
    public class NoOpPlugin : PluginBase
    {
        public NoOpPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(NoOpPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
            {
                throw new ArgumentNullException(nameof(localPluginContext));
            }
        }
    }
}
