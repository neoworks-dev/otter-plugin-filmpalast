import { parse } from "node-html-parser";
import { fetchHtml } from "@neoworks-dev/otter-sdk";
import {
  resolveUrl,
  BASE_URL,
  slugFromUrl,
  isEpisodeSlug,
  seriesSlugFromEpisode,
} from "./http.ts";
import type { DiscoverResult, DiscoveredItem } from "@neoworks-dev/otter-sdk";

export async function discover(query: string, limit: number): Promise<DiscoverResult> {
  const q = query.trim().toLowerCase();
  const half = limit > 0 ? Math.ceil(limit / 2) : 0;
  const [movies, series] = await Promise.all([
    discoverMovies(q, half),
    discoverSeries(q, half),
  ]);
  return { items: [...movies, ...series] };
}

async function discoverMovies(query: string, limit: number): Promise<DiscoveredItem[]> {
  const items: DiscoveredItem[] = [];

  for (let page = 1; page <= 500; page++) {
    const url = `${BASE_URL}/movies/new/page/${page}`;
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch {
      break;
    }

    const root = parse(html);
    const links = root.querySelectorAll('a[href*="/stream/"]');
    if (links.length === 0) break;

    let added = 0;
    for (const a of links) {
      const href = a.getAttribute("href") ?? "";
      const slug = slugFromUrl(href);
      if (!slug || isEpisodeSlug(slug)) continue;

      const title =
        a.getAttribute("title") ??
        a.querySelector("img")?.getAttribute("alt")?.replace(/^stream\s+/i, "") ??
        a.text.trim();
      if (!title) continue;

      const img = a.querySelector("img");
      const poster = img ? resolveUrl(img.getAttribute("src") ?? "") : "";

      items.push({
        title,
        media_type: "movie",
        source_url: resolveUrl(href),
        external_id: `filmpalast-${slug}`,
        poster,
      });
      added++;
    }
    if (added === 0) break;
    if (limit > 0 && items.length >= limit) break;
  }

  const results = query
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          i.external_id.includes(query)
      )
    : items;
  return limit > 0 ? results.slice(0, limit) : results;
}

async function discoverSeries(query: string, limit: number): Promise<DiscoveredItem[]> {
  const seen = new Map<string, DiscoveredItem>();

  for (let page = 1; page <= 500; page++) {
    const url = `${BASE_URL}/serien/view/page/${page}`;
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch {
      break;
    }

    const root = parse(html);
    const links = root.querySelectorAll('a[href*="/stream/"]');
    if (links.length === 0) break;

    let added = 0;
    for (const a of links) {
      const href = a.getAttribute("href") ?? "";
      const slug = slugFromUrl(href);
      if (!slug || !isEpisodeSlug(slug)) continue;

      const seriesSlug = seriesSlugFromEpisode(slug);
      if (seen.has(seriesSlug)) continue;

      const rawTitle =
        a.getAttribute("title") ??
        a.querySelector("img")?.getAttribute("alt")?.replace(/^stream\s+/i, "") ??
        a.text.trim();
      const title = rawTitle.replace(/\s+S\d+E\d+.*/i, "").trim() || rawTitle;
      if (!title) continue;

      const img = a.querySelector("img");
      const poster = img ? resolveUrl(img.getAttribute("src") ?? "") : "";

      seen.set(seriesSlug, {
        title,
        media_type: "series",
        source_url: resolveUrl(href),
        external_id: `filmpalast-${seriesSlug}`,
        poster,
      });
      added++;
    }
    if (added === 0) break;
    if (limit > 0 && seen.size >= limit) break;
  }

  const items = Array.from(seen.values());
  const filtered = !query
    ? items
    : items.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          i.external_id.includes(query)
      );
  return limit > 0 ? filtered.slice(0, limit) : filtered;
}
