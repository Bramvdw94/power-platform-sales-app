using System;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Who may write a Quota row. Kept free of Dataverse types so it can be unit tested.
    /// </summary>
    public static class QuotaRules
    {
        /// <returns>The refusal message, or null when the write is allowed.</returns>
        public static string Check(
            Guid caller,
            Guid salesperson,
            Guid? salespersonManager,
            bool callerIsSystemAdministrator,
            DateTime month,
            decimal amount)
        {
            if (month.Day != 1)
            {
                return "A Quota is for a whole month: the Month must be its first day.";
            }

            if (amount < 0)
            {
                return "A Quota cannot be negative.";
            }

            if (caller == salesperson)
            {
                return "Nobody sets their own Quota. It is set by your manager, or by a system administrator if you have none.";
            }

            if (callerIsSystemAdministrator)
            {
                return null;
            }

            if (salespersonManager.HasValue)
            {
                return caller == salespersonManager.Value
                    ? null
                    : "A Quota can only be set by the salesperson's manager.";
            }

            return "Someone without a manager gets their Quota from a system administrator.";
        }
    }
}
