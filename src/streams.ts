import { parse, HTMLElement } from "node-html-parser";
import { fetchHtml } from "@neoworks-dev/otter-sdk";
import type { StreamsArgs, StreamsResult, Download, DiscoveredItem } from "@neoworks-dev/otter-sdk";
import { BASE_URL, resolveUrl, providerFromUrl } from "./http.ts";
import { search } from "./search.ts";

// findStreams locates an item already known from TMDB on filmpalast and returns
// only its playable links. Metadata (title, cast, genres) comes from TMDB, so
// this plugin no longer scrapes any of it.
export async function findStreams(args: StreamsArgs): Promise<StreamsResult> {
  const pageUrl = await locate(args);
  if (!pageUrl) return { downloads: [] };

  const html = await fetchHtml(pageUrl);
  const root = parse(html);
  return { downloads: extractDownloads(root) };
}

// locate returns the filmpalast stream-page URL for the requested item, or "".
async function locate(args: StreamsArgs): Promise<string> {
  if (args.media_type === "episode") {
    const seriesSlug = await findSeriesSlug(args);
    if (!seriesSlug) return "";
    const season = pad(args.season_number);
    const episode = pad(args.episode_number);
    return `${BASE_URL}/stream/${seriesSlug}-s${season}e${episode}`;
  }

  const match = await bestMatch(args, "movie");
  return match?.source_url ?? "";
}

async function findSeriesSlug(args: StreamsArgs): Promise<string> {
  const match = await bestMatch(args, "series");
  if (!match) return "";
  return match.external_id.replace(/^filmpalast-/, "");
}

// bestMatch searches filmpalast and picks the closest title of the right type.
async function bestMatch(
  args: StreamsArgs,
  mediaType: "movie" | "series",
): Promise<DiscoveredItem | null> {
  const queries = [args.title, args.original_title].filter(
    (q): q is string => !!q && q.trim().length > 0,
  );
  for (const query of queries) {
    const { items } = await search(query, 20);
    const candidates = items.filter((item) => item.media_type === mediaType);
    const match = pickByTitle(candidates, query);
    if (match) return match;
  }
  return null;
}

function pickByTitle(items: DiscoveredItem[], query: string): DiscoveredItem | null {
  const target = normalizeTitle(query);
  const exact = items.find((item) => normalizeTitle(item.title) === target);
  if (exact) return exact;
  return items[0] ?? null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// extractDownloads pulls provider stream links from a filmpalast detail page.
function extractDownloads(root: HTMLElement): Download[] {
  const seen = new Set<string>();
  const results: Download[] = [];
  for (const a of root.querySelectorAll('a.button.rb[href^="http"]')) {
    const url = a.getAttribute("href") ?? "";
    if (!url.startsWith("http") || seen.has(url)) continue;
    seen.add(url);

    const li = a.closest("li");
    const rawText = li?.text.trim() ?? "";
    const label = rawText.replace(/\bPlay\b/gi, "").trim() || providerFromUrl(url);

    results.push({
      label,
      url,
      quality: /\bHD\b/i.test(label) ? "HD" : undefined,
      language: "de",
    });
  }
  return results;
}
