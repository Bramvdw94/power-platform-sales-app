using System;

namespace SalesApp.Plugins
{
    /// <summary>
    /// The Product line arithmetic and limits (issue 100). Free of Dataverse types so it can
    /// be unit tested; src/sales/product-lines.ts holds the same rules for the app.
    /// </summary>
    public static class ProductLineRules
    {
        /// <summary>Quantity x unit price x (1 - discount %), rounded to cents (half away from zero).</summary>
        public static decimal LineAmount(decimal quantity, decimal unitPrice, decimal discountPercent)
        {
            // The columns hold two decimals, so work on what they will hold.
            quantity = Math.Round(quantity, 2, MidpointRounding.AwayFromZero);
            unitPrice = Math.Round(unitPrice, 2, MidpointRounding.AwayFromZero);
            discountPercent = Math.Round(discountPercent, 2, MidpointRounding.AwayFromZero);
            return Math.Round(quantity * unitPrice * (100m - discountPercent) / 100m, 2, MidpointRounding.AwayFromZero);
        }

        /// <returns>The refusal message, or null when the values are allowed.</returns>
        public static string Check(decimal quantity, decimal unitPrice, decimal discountPercent)
        {
            if (Math.Round(quantity, 2, MidpointRounding.AwayFromZero) <= 0m)
            {
                return "A Product line needs a quantity above zero.";
            }

            if (unitPrice < 0m)
            {
                return "A Product line cannot have a negative unit price.";
            }

            if (discountPercent < 0m || discountPercent > 100m)
            {
                return "A discount is a percentage from 0 to 100.";
            }

            return null;
        }
    }
}
