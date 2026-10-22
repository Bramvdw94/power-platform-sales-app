using System;

namespace SalesApp.Plugins
{
    /// <summary>
    /// When a Reassign tells the new Owner, and what it says. Kept free of Dataverse types so it can be unit tested.
    /// The text matches reassignText in src/sales/notifications.ts, which the in-memory gateway uses.
    /// </summary>
    public static class ReassignNotificationRules
    {
        /// <summary>The Notification kind choice: Reassign is the first option of vibe_notificationkind.</summary>
        public const int ReassignKind = 841200000;

        /// <summary>Handing a record to yourself tells nobody anything.</summary>
        public static bool ShouldNotify(Guid newOwner, Guid caller)
        {
            return newOwner != Guid.Empty && newOwner != caller;
        }

        /// <param name="table">lead, opportunity, account or contact (the engine's table names).</param>
        public static string Text(string byName, string table, string recordName)
        {
            return $"{byName} assigned you the {Label(table)} {recordName}.";
        }

        public static string Label(string table)
        {
            switch (table)
            {
                case "lead": return "Lead";
                case "opportunity": return "Opportunity";
                case "account": return "Account";
                case "contact": return "Contact";
                default: throw new ArgumentOutOfRangeException(nameof(table), table, "Not a record the app opens.");
            }
        }

        /// <summary>A Notification's text column holds 500 characters.</summary>
        public static string Fit(string text)
        {
            return text.Length <= 500 ? text : text.Substring(0, 499) + "…";
        }
    }
}
