using System;
using Microsoft.Xrm.Sdk;
using SalesApp.Plugins.Engine;
using Xunit;

namespace SalesApp.Plugins.Tests
{
    public class FieldMapTests
    {
        [Fact]
        public void An_Opportunity_row_reads_into_the_engines_field_names()
        {
            var owner = Guid.NewGuid();
            var entity = new Entity("vibe_opportunity", Guid.NewGuid());
            entity["vibe_stage"] = new OptionSetValue(FieldMap.ChoiceBase + 2);
            entity["vibe_estimatedvalue"] = new Money(60000m);
            entity["vibe_expectedclosedate"] = new DateTime(2026, 12, 1);
            entity["vibe_probability"] = 40;
            entity["ownerid"] = new EntityReference("systemuser", owner);
            entity["vibe_stepenteredon"] = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

            var record = FieldMap.ToRecord("opportunity", entity);

            Assert.Equal("proposal", record["stage"]);
            Assert.Equal(60000d, record["estimatedValue"]);
            Assert.Equal("2026-12-01", record["expectedCloseDate"]);
            Assert.Equal(40d, record["probability"]);
            Assert.Equal(owner.ToString("D"), record["ownerId"]);
            Assert.Equal("2026-10-12T09:30:00Z", record["stepEnteredOn"]);
            Assert.Null(record["nextStep"]);
        }

        [Fact]
        public void Account_type_and_industry_use_dataverses_standard_codes()
        {
            var account = new Entity("account", Guid.NewGuid());
            account["customertypecode"] = new OptionSetValue(5);
            account["industrycode"] = new OptionSetValue(7);

            var record = FieldMap.ToRecord("account", account);

            Assert.Equal("partner", record["accountType"]);
            Assert.Equal("consulting", record["industry"]);
        }

        [Theory]
        [InlineData("opportunity", "stage", "negotiation")]
        [InlineData("lead", "status", "working")]
        [InlineData("lead", "leadSource", "partner")]
        [InlineData("account", "accountType", "reseller")]
        [InlineData("account", "industry", "wholesale")]
        public void A_choice_written_back_reads_the_same(string table, string field, string value)
        {
            var def = Array.Find(FieldMap.Tables[table], f => f.Name == field);

            object attribute;
            Assert.True(FieldMap.TryToAttribute(def, value, out attribute));

            Assert.Equal(value, FieldMap.ToEngine(def, attribute));
        }

        [Fact]
        public void A_lookup_and_a_moment_survive_the_round_trip()
        {
            var id = Guid.NewGuid().ToString("D");
            var version = Array.Find(FieldMap.Tables["lead"], f => f.Name == "processVersionId");
            var entered = Array.Find(FieldMap.Tables["lead"], f => f.Name == "stepEnteredOn");

            object lookup, moment;
            Assert.True(FieldMap.TryToAttribute(version, id, out lookup));
            Assert.True(FieldMap.TryToAttribute(entered, "2026-10-12T10:00:00Z", out moment));

            Assert.Equal("vibe_processversion", ((EntityReference)lookup).LogicalName);
            Assert.Equal(id, FieldMap.ToEngine(version, lookup));
            Assert.Equal("2026-10-12T10:00:00Z", FieldMap.ToEngine(entered, moment));
        }

        [Fact]
        public void A_choice_value_that_does_not_exist_is_not_stored()
        {
            var stage = Array.Find(FieldMap.Tables["opportunity"], f => f.Name == "stage");

            object attribute;
            Assert.False(FieldMap.TryToAttribute(stage, "shipped", out attribute));
        }

        [Fact]
        public void The_catalogue_knows_the_four_tables_and_the_related_lists()
        {
            var catalogue = FieldMap.Catalogue();

            Assert.Contains("estimatedValue", catalogue["opportunity"].Keys);
            Assert.Equal("choice", catalogue["lead"]["status"].Type);
            Assert.Contains("completed", catalogue["task"].Keys);
        }
    }
}
