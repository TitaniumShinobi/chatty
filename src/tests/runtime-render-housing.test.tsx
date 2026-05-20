import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { advanceGalleryIndex } from "../components/housingResultUtils";
import { R } from "../runtime/render";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => (
    <div className={className}>{children}</div>
  ),
}));

describe("packet renderer", () => {
  it("renders structured citations from answer packets", () => {
    const markup = renderToStaticMarkup(
      <R
        packets={[
          {
            op: "answer.v1",
            payload: {
              content: "Saved search recap with a packet citation.",
              citations: [
                {
                  index: 1,
                  title: "HousingWire",
                  url: "https://example.com/housingwire",
                  snippet: "Market trend coverage for the cited neighborhood.",
                },
              ],
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Saved search recap with a packet citation.");
    expect(markup).toContain("Sources");
    expect(markup).toContain("https://example.com/housingwire");
    expect(markup).toContain("HousingWire");
    expect(markup).toContain("Market trend coverage for the cited neighborhood.");
  });

  it("parses legacy markdown sources as packet citations and strips the raw block", () => {
    const markup = renderToStaticMarkup(
      <R
        packets={[
          {
            op: "answer.v1",
            payload: {
              content: [
                "Neighborhood summary.",
                "",
                "---",
                "",
                "**Sources:**",
                "",
                "[1] County assessor (https://example.com/assessor)",
                "[2] [MLS listing](https://example.com/mls)",
              ].join("\n"),
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Neighborhood summary.");
    expect(markup).not.toContain("**Sources:**");
    expect(markup).toContain("https://example.com/assessor");
    expect(markup).toContain("County assessor");
    expect(markup).toContain("https://example.com/mls");
    expect(markup).toContain("MLS listing");
  });

  it("renders housing result cards and exposes gallery cycling logic", () => {
    const markup = renderToStaticMarkup(
      <R
        packets={[
          {
            op: "housing.results.v1",
            payload: {
              query: "Austin homes under 600k",
              total: 1,
              results: [
                {
                  id: "listing-1",
                  title: "South Congress bungalow",
                  address: "123 South Congress Ave",
                  city: "Austin",
                  state: "TX",
                  price: 540000,
                  bedrooms: 3,
                  bathrooms: 2,
                  sqft: 1420,
                  propertyType: "Single-family",
                  status: "For sale",
                  source: "MLS",
                  listingUrl: "https://example.com/listing-1",
                  citationIndex: 2,
                  images: [
                    {
                      url: "https://example.com/listing-1/front.jpg",
                      alt: "Front exterior",
                    },
                    {
                      url: "https://example.com/listing-1/kitchen.jpg",
                      alt: "Kitchen",
                    },
                  ],
                },
              ],
              citations: [
                {
                  index: 2,
                  title: "MLS Listing",
                  url: "https://example.com/listing-1",
                },
              ],
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("1 home for Austin homes under 600k");
    expect(markup).toContain("South Congress bungalow");
    expect(markup).toContain("$540,000");
    expect(markup).toContain("3 bd");
    expect(markup).toContain("Front exterior");
    expect(markup).toContain("https://example.com/listing-1");
    expect(markup).toContain("[2]");

    expect(advanceGalleryIndex(0, 2, 1)).toBe(1);
    expect(advanceGalleryIndex(1, 2, 1)).toBe(0);
    expect(advanceGalleryIndex(0, 2, -1)).toBe(1);
  });
});
