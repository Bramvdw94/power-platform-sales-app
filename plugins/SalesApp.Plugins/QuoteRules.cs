using System;
using System.Collections.Generic;
using System.Linq;

namespace SalesApp.Plugins
{
    /// <summary>One Quote line as the totals see it: its amount and the VAT percentage of its Product.</summary>
    public struct QuoteLineAmount
    {
        public QuoteLineAmount(decimal amount, int vatRate)
        {
            Amount = amount;
            VatRate = vatRate;
        }

        public decimal Amount { get; }

        public int VatRate { get; }
    }

    public struct QuoteTotals
    {
        public decimal Net { get; set; }

        public decimal Vat21 { get; set; }

        public decimal Vat9 { get; set; }

        public decimal Gross { get; set; }
    }

    /// <summary>
    /// The Quote arithmetic and transitions (issue 101). Free of Dataverse types so it can be
    /// unit tested; src/sales/quotes.ts holds the same rules for the app.
    /// </summary>
    public static class QuoteRules
    {
        public const int Draft = 1;
        public const int Sent = 2;
        public const int Accepted = 3;
        public const int Rejected = 4;
        public const int Revised = 5;

        /// <summary>
        /// Net total: the lines' amounts added up. VAT per rate: the net total of the lines at that
        /// rate times the rate, rounded to cents (half away from zero). Gross: net plus VAT.
        /// </summary>
        public static QuoteTotals Totals(IEnumerable<QuoteLineAmount> lines)
        {
            var list = lines.ToList();
            var net = list.Sum(l => l.Amount);
            Func<int, decimal> vat = rate =>
                Math.Round(list.Where(l => l.VatRate == rate).Sum(l => l.Amount) * rate / 100m, 2, MidpointRounding.AwayFromZero);
            var vat21 = vat(21);
            var vat9 = vat(9);
            return new QuoteTotals { Net = net, Vat21 = vat21, Vat9 = vat9, Gross = net + vat21 + vat9 };
        }

        /// <summary>A Draft goes to Sent; a Sent Quote to Accepted, Rejected or Revised; nothing leaves those.</summary>
        public static bool CanMove(int from, int to)
        {
            if (from == Draft)
            {
                return to == Sent;
            }

            return from == Sent && (to == Accepted || to == Rejected || to == Revised);
        }
    }
}
