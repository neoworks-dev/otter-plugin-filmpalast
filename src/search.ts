import { parse } from "node-html-parser";
import { fetchHtml } from "@neoworks-dev/otter-sdk";
import { BASE_URL, resolveUrl, slugFromUrl, isEpisodeSlug, seriesSlugFromEpisode } from "./http.ts";
import type { SearchResult, DiscoveredItem } from "@neoworks-dev/otter-sdk";

export async function search(query: string, limit?: number): Promise<SearchResult> {
  if (!query.trim()) return { items: [] };

  const q = encodeURIComponent(query.trim());
  const html = await fetchHtml(`${BASE_URL}/search/title/${q}`);
  const root = parse(html);
  const items: DiscoveredItem[] = [];
  const seenSeries = new Set<string>();

  for (const a of root.querySelectorAll('a[href*="/stream/"]')) {
    const href = a.getAttribute("href") ?? "";
    const slug = slugFromUrl(href);
    if (!slug) continue;

    if (isEpisodeSlug(slug)) {
      const seriesSlug = seriesSlugFromEpisode(slug);
      if (seenSeries.has(seriesSlug)) continue;
      seenSeries.add(seriesSlug);

      const rawTitle =
        a.getAttribute("title") ??
        a.querySelector("img")?.getAttribute("alt")?.replace(/^stream\s+/i, "") ??
        a.text.trim();
      const title = rawTitle.replace(/\s+S\d+E\d+.*/i, "").trim() || rawTitle;
      if (!title) continue;

      const img = a.querySelector("img");
      items.push({
        title,
        media_type: "series",
        source_url: resolveUrl(href),
        external_id: `filmpalast-${seriesSlug}`,
        poster: img ? resolveUrl(img.getAttribute("src") ?? "") : undefined,
      });
    } else {
      const title =
        a.getAttribute("title") ??
        a.querySelector("img")?.getAttribute("alt")?.replace(/^stream\s+/i, "") ??
        a.text.trim();
      if (!title) continue;

      const img = a.querySelector("img");
      items.push({
        title,
        media_type: "movie",
        source_url: resolveUrl(href),
        external_id: `filmpalast-${slug}`,
        poster: img ? resolveUrl(img.getAttribute("src") ?? "") : undefined,
      });
    }

    if (limit != null && limit > 0 && items.length >= limit) break;
  }

  return { items };
}
