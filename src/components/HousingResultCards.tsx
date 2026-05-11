import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, MapPin } from "lucide-react";
import type { HousingResultCard, HousingResultImage, HousingResultsPacketPayload } from "../types";
import PacketCitations from "./PacketCitations";
import { advanceGalleryIndex } from "./housingResultUtils";

type GalleryImage = HousingResultImage;

function toNumber(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.]+/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCurrency(value: number | string | undefined, currency = "USD"): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  const numericValue = toNumber(value);
  if (numericValue == null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(numericValue);
  } catch {
    return `$${numericValue.toLocaleString("en-US")}`;
  }
}

function formatMeasure(value: number | string | undefined, suffix: string): string | null {
  if (typeof value === "string" && value.trim()) return `${value.trim()} ${suffix}`;
  const numericValue = toNumber(value);
  if (numericValue == null) return null;
  return `${numericValue.toLocaleString("en-US")} ${suffix}`;
}

function formatCount(value: number | string | undefined, suffix: string): string | null {
  if (typeof value === "string" && value.trim()) return `${value.trim()} ${suffix}`;
  const numericValue = toNumber(value);
  if (numericValue == null) return null;
  return `${Number.isInteger(numericValue) ? numericValue : numericValue.toFixed(1)} ${suffix}`;
}

function getResultAddress(result: HousingResultCard): string {
  const street = result.addressLine1?.trim() || result.address?.trim();
  const locality = [result.city?.trim(), result.state?.trim(), result.zipCode?.trim()]
    .filter(Boolean)
    .join(", ");

  if (street && locality) {
    return `${street}, ${locality}`;
  }
  return street || locality || "Address unavailable";
}

function getListingUrl(result: HousingResultCard): string | null {
  return result.listingUrl || result.url || result.sourceUrl || null;
}

function normalizeGalleryImages(result: HousingResultCard): GalleryImage[] {
  const rawImages = Array.isArray(result.images) && result.images.length > 0
    ? result.images
    : Array.isArray(result.photos)
      ? result.photos
      : [];

  return rawImages
    .map((image, index) => {
      if (typeof image === "string") {
        return {
          url: image,
          alt: `${result.title || getResultAddress(result)} image ${index + 1}`,
        };
      }

      if (!image?.url) return null;
      return {
        url: image.url,
        alt: image.alt || `${result.title || getResultAddress(result)} image ${index + 1}`,
      };
    })
    .filter((image): image is GalleryImage => Boolean(image?.url));
}

function getResultFacts(result: HousingResultCard): string[] {
  return [
    formatCount(result.bedrooms, "bd"),
    formatCount(result.bathrooms, "ba"),
    formatMeasure(result.sqft, "sqft"),
  ].filter((value): value is string => Boolean(value));
}

function getCitationIndexes(result: HousingResultCard): number[] {
  const indexes = [
    ...(Array.isArray(result.citationIndices) ? result.citationIndices : []),
    ...(typeof result.citationIndex === "number" ? [result.citationIndex] : []),
  ];

  return Array.from(new Set(indexes.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
}

export function HousingResultCardView({ result }: { result: HousingResultCard }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const images = normalizeGalleryImages(result);
  const facts = getResultFacts(result);
  const address = getResultAddress(result);
  const listingUrl = getListingUrl(result);
  const price = formatCurrency(result.price, result.currency);
  const citationIndexes = getCitationIndexes(result);
  const activeImage = images[activeImageIndex] ?? null;
  const resultLabel = result.title?.trim() || address;

  const showPreviousImage = () => {
    setActiveImageIndex((previous) => advanceGalleryIndex(previous, images.length, -1));
  };

  const showNextImage = () => {
    setActiveImageIndex((previous) => advanceGalleryIndex(previous, images.length, 1));
  };

  return (
    <article
      className="overflow-hidden rounded-2xl"
      style={{
        border: "1px solid var(--chatty-line)",
        backgroundColor: "var(--chatty-bg-secondary)",
        color: "var(--chatty-text)",
      }}
    >
      {activeImage ? (
        <div className="border-b" style={{ borderColor: "var(--chatty-line)" }}>
          <div className="relative">
            <img
              src={activeImage.url}
              alt={activeImage.alt}
              className="h-56 w-full object-cover"
            />
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  aria-label={`Previous photo for ${resultLabel}`}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2 transition-colors"
                  style={{ backgroundColor: "rgba(0, 0, 0, 0.55)", color: "white" }}
                  onClick={showPreviousImage}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label={`Next photo for ${resultLabel}`}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 transition-colors"
                  style={{ backgroundColor: "rgba(0, 0, 0, 0.55)", color: "white" }}
                  onClick={showNextImage}
                >
                  <ChevronRight size={18} />
                </button>
              </>
            ) : null}
            <div
              className="absolute bottom-3 right-3 rounded-full px-2 py-1 text-xs font-medium"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", color: "white" }}
            >
              {activeImageIndex + 1} / {images.length}
            </div>
          </div>
          {images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto px-3 py-3">
              {images.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  aria-label={`Show photo ${index + 1} for ${resultLabel}`}
                  onClick={() => setActiveImageIndex(index)}
                  className="shrink-0 overflow-hidden rounded-xl border"
                  style={{
                    borderColor: index === activeImageIndex ? "var(--chatty-text)" : "var(--chatty-line)",
                    opacity: index === activeImageIndex ? 1 : 0.72,
                  }}
                >
                  <img
                    src={image.url}
                    alt=""
                    aria-hidden="true"
                    className="h-14 w-20 object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className="flex h-40 items-center justify-center gap-2 border-b px-4 text-sm"
          style={{
            borderColor: "var(--chatty-line)",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            opacity: 0.72,
          }}
        >
          <ImageOff size={18} />
          <span>No photos available</span>
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-2xl font-semibold leading-none">{price || "Price unavailable"}</div>
            <div className="mt-2 text-base font-medium break-words">
              {result.title?.trim() || address}
            </div>
            {result.title?.trim() ? (
              <div className="mt-1 flex items-start gap-1.5 text-sm break-words" style={{ opacity: 0.82 }}>
                <MapPin size={14} className="mt-0.5 shrink-0" />
                <span>{address}</span>
              </div>
            ) : null}
          </div>

          {listingUrl ? (
            <a
              href={listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium"
              style={{
                border: "1px solid var(--chatty-line)",
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                color: "var(--chatty-text)",
                textDecoration: "none",
              }}
            >
              <span>View listing</span>
              <ExternalLink size={14} />
            </a>
          ) : null}
        </div>

        {facts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {facts.map((fact) => (
              <span
                key={fact}
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid var(--chatty-line)",
                }}
              >
                {fact}
              </span>
            ))}
          </div>
        ) : null}

        {result.tags?.length ? (
          <div className="flex flex-wrap gap-2">
            {result.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full px-2.5 py-1 text-xs"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid var(--chatty-line)",
                  opacity: 0.84,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" style={{ opacity: 0.78 }}>
          {result.status?.trim() ? <span>{result.status.trim()}</span> : null}
          {result.propertyType?.trim() ? <span>{result.propertyType.trim()}</span> : null}
          {result.source?.trim() ? <span>{result.source.trim()}</span> : null}
          {result.broker?.trim() ? <span>{result.broker.trim()}</span> : null}
          {citationIndexes.length > 0 ? (
            <span>{citationIndexes.map((index) => `[${index}]`).join(" ")}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function getSummaryText(payload: HousingResultsPacketPayload): string | null {
  const count = Array.isArray(payload.results) ? payload.results.length : 0;
  if (!count && payload.total == null && !payload.query && !payload.region) {
    return null;
  }

  const total = payload.total ?? count;
  const resultLabel = total === 1 ? "home" : "homes";
  const scope = [payload.query?.trim(), payload.region?.trim()].filter(Boolean).join(" · ");

  if (scope) {
    return `${total} ${resultLabel} for ${scope}`;
  }
  return `${total} ${resultLabel}`;
}

export default function HousingResultCards({
  payload,
}: {
  payload: HousingResultsPacketPayload;
}) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const summary = getSummaryText(payload);

  if (results.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          border: "1px solid var(--chatty-line)",
          backgroundColor: "var(--chatty-bg-secondary)",
          color: "var(--chatty-text)",
          opacity: 0.78,
        }}
      >
        No housing results were returned.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {summary ? (
        <div className="text-sm font-medium" style={{ color: "var(--chatty-text)", opacity: 0.82 }}>
          {summary}
        </div>
      ) : null}
      <div className="grid gap-3">
        {results.map((result, index) => (
          <HousingResultCardView
            key={result.id || result.listingUrl || result.url || `${getResultAddress(result)}-${index}`}
            result={result}
          />
        ))}
      </div>
      <PacketCitations citations={payload.citations} />
    </div>
  );
}
