import { test, expect, describe } from "bun:test";

import {
  resolveUrl,
  slugFromUrl,
  isEpisodeSlug,
  seriesSlugFromEpisode,
  parseEpisodeNumbers,
  providerFromUrl,
  BASE_URL,
} from "../src/http.ts";
import { search } from "../src/search.ts";
import { findStreams } from "../src/streams.ts";

// ---------------------------------------------------------------------------
// Pure URL/slug helpers (no network)

describe("http helpers", () => {
  test("resolveUrl handles relative, absolute and protocol-relative", () => {
    expect(resolveUrl("/stream/dark")).toBe(`${BASE_URL}/stream/dark`);
    expect(resolveUrl("stream/dark")).toBe(`${BASE_URL}/stream/dark`);
    expect(resolveUrl("https://cdn.example/x.jpg")).toBe("https://cdn.example/x.jpg");
    expect(resolveUrl("//cdn.example/x.jpg")).toBe("https://cdn.example/x.jpg");
  });

  test("slugFromUrl extracts the slug and drops trailing path", () => {
    expect(slugFromUrl("https://filmpalast.to/stream/inception")).toBe("inception");
    expect(slugFromUrl("/stream/dark-s01e01/")).toBe("dark-s01e01");
  });

  test("isEpisodeSlug detects sNNeNN suffixes", () => {
    expect(isEpisodeSlug("dark-s01e01")).toBe(true);
    expect(isEpisodeSlug("dark_s2e10")).toBe(true);
    expect(isEpisodeSlug("inception")).toBe(false);
  });

  test("seriesSlugFromEpisode strips the episode suffix", () => {
    expect(seriesSlugFromEpisode("dark-s01e01")).toBe("dark");
    expect(seriesSlugFromEpisode("the-boys-s02e08")).toBe("the-boys");
  });

  test("parseEpisodeNumbers returns season/episode or null", () => {
    expect(parseEpisodeNumbers("dark-s03e07")).toEqual({ season: 3, episode: 7 });
    expect(parseEpisodeNumbers("inception")).toBeNull();
  });

  test("providerFromUrl returns the bare host label", () => {
    expect(providerFromUrl("https://www.voe.sx/abc")).toBe("voe");
    expect(providerFromUrl("not a url")).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Live integration — real HTTP against filmpalast.to. Chained so they survive
// catalog changes (scrape a title that search actually returned). Requires
// network access to filmpalast.to; generous timeouts for the live site.

const NET_TIMEOUT = 30_000;
// A very common German stopword — reliably matches a large slice of the catalog.
const QUERY = "der";

describe("search (live)", () => {
  test(
    "returns well-formed items for a common query",
    async () => {
      const { items } = await search(QUERY, 10);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.title.trim()).not.toBe("");
        expect(item.source_url).toContain("/stream/");
        expect(item.external_id).toStartWith("filmpalast-");
        expect(["movie", "series"]).toContain(item.media_type);
      }
    },
    NET_TIMEOUT
  );
});

describe("findStreams (live)", () => {
  test(
    "finds playable links for a movie surfaced by search",
    async () => {
      const { items } = await search(QUERY, 20);
      const movieHit = items.find((i) => i.media_type === "movie");
      expect(movieHit).toBeDefined();

      const { downloads } = await findStreams({
        media_type: "movie",
        title: movieHit!.title,
      });

      // Download links are absolute and de-duplicated by URL.
      const urls = downloads.map((d) => d.url);
      for (const url of urls) expect(url).toStartWith("http");
      expect(new Set(urls).size).toBe(urls.length);
    },
    2 * NET_TIMEOUT
  );
});
