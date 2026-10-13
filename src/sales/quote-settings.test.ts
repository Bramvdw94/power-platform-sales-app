import { describe, expect, it } from "vitest"
import { defaultEmail, fillPlaceholders, isEmailAddress, messageToHtml, quotePdfFileName, quoteSettingsErrors, sentDescription, splitAddresses } from "."

describe("Quote settings", () => {
  it("fill placeholders and leave an unknown one visible", () => {
    expect(fillPlaceholders("Offerte {{quote_number}} voor {{ contact_name }} {{nope}}", { quote_number: "Q-00001", contact_name: "Sanne" })).toBe("Offerte Q-00001 voor Sanne {{nope}}")
  })

  it("prefill the email subject and message from the Quote", () => {
    const email = defaultEmail(
      { emailSubject: "Offerte {{quote_number}}", emailMessage: "Beste {{contact_name}}, geldig tot {{valid_until}}. {{owner_name}}, {{company}}" },
      { quote: { number: "Q-00007", validUntil: "2026-11-08" }, contactName: "Sanne de Vries", owner: { fullName: "Adele Vance" }, settings: { companyName: "Northwind" }, formatDate: (d) => `on ${d}` },
    )
    expect(email).toEqual({ subject: "Offerte Q-00007", message: "Beste Sanne de Vries, geldig tot on 2026-11-08. Adele Vance, Northwind" })
  })

  it("check the validity and the logo", () => {
    expect(quoteSettingsErrors({ defaultValidityDays: 0 })).toHaveProperty("defaultValidityDays")
    expect(quoteSettingsErrors({ defaultValidityDays: 14 })).toEqual({})
    expect(quoteSettingsErrors({ logo: "data:image/gif;base64,AAAA" })).toHaveProperty("logo")
    expect(quoteSettingsErrors({ logo: "data:image/png;base64,AAAA" })).toEqual({})
  })

  it("recognise an email address and split a Cc list", () => {
    expect(isEmailAddress("a@b.example")).toBe(true)
    expect(isEmailAddress("a@b")).toBe(false)
    expect(splitAddresses("a@b.nl, c@d.nl;e@f.nl")).toEqual(["a@b.nl", "c@d.nl", "e@f.nl"])
  })

  it("name the PDF after the Quote and its Revision", () => {
    expect(quotePdfFileName({ number: "Q-00001", revision: 0 })).toBe("Q-00001.pdf")
    expect(quotePdfFileName({ number: "Q-00001", revision: 2 })).toBe("Q-00001-rev2.pdf")
  })

  it("write an email message as escaped HTML", () => {
    expect(messageToHtml("a <b> & c\nd")).toContain("a &lt;b&gt; &amp; c<br>d")
  })

  it("describe how a Quote was sent", () => {
    const f = (d: string) => `D(${d})`
    expect(sentDescription({ sentOn: "x", sentByName: "Alex", sentVia: "email", sentTo: "p@f.nl" }, f)).toBe("Sent on D(x) by Alex via Outlook to p@f.nl.")
    expect(sentDescription({ sentOn: "x", sentByName: "Alex", sentVia: "download" }, f)).toBe("Sent on D(x) by Alex via download.")
    expect(sentDescription({}, f)).toBe("")
  })
})
