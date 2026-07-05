import { describe, expect, it } from "vitest"

import { extractUrls, urlDomain } from "@/lib/detect-urls"

describe("extractUrls", () => {
  it("finds explicit http(s) URLs in prose", () => {
    expect(extractUrls("Check https://stripe.com/pricing and tell me.")).toEqual([
      "https://stripe.com/pricing",
    ])
  })

  it("upgrades bare domains with recognizable web TLDs", () => {
    expect(extractUrls("Use linear.app as the reference.")).toEqual(["https://linear.app"])
  })

  it("ignores filenames that look like domains", () => {
    expect(extractUrls("See notes.md and data.csv for details.")).toEqual([])
  })

  it("strips trailing punctuation from URLs", () => {
    expect(extractUrls("Read https://example.com/post.")).toEqual(["https://example.com/post"])
  })

  it("dedupes repeated URLs and keeps order", () => {
    expect(
      extractUrls("https://a.com then https://b.com then https://a.com again"),
    ).toEqual(["https://a.com", "https://b.com"])
  })

  it("returns nothing for plain text", () => {
    expect(extractUrls("Quarterly revenue grew 14 percent.")).toEqual([])
  })
})

describe("urlDomain", () => {
  it("strips protocol and www", () => {
    expect(urlDomain("https://www.stripe.com/pricing")).toBe("stripe.com")
  })

  it("falls back to the raw value when unparsable", () => {
    expect(urlDomain("not a url")).toBe("not a url")
  })
})
