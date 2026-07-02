import { parse, HTMLElement } from "node-html-parser";
import { fetchHtml } from "@neoworks-dev/otter-sdk";
import {
  resolveUrl,
  BASE_URL,
  slugFromUrl,
  isEpisodeSlug,
  seriesSlugFromEpisode,
  parseEpisodeNumbers,
  providerFromUrl,
} from "./http.ts";
import type {
  ScrapeResult,
  Movie,
  Series,
  Season,
  Episode,
  Image,
  Download,
} from "@neoworks-dev/otter-sdk";

export async function scrape(url: string): Promise<ScrapeResult[]> {
  const slug = slugFromUrl(resolveUrl(url));
  if (isEpisodeSlug(slug)) return scrapeSeriesEpisode(resolveUrl(url));
  return scrapeMovie(resolveUrl(url));
}

// Fields shared by every media observation filmpalast can extract.
interface CommonFields {
  overview: string;
  poster_path: string;
  genres: string[];
  images: Image[];
  downloads: Download[];
}

function posterImages(poster: string): Image[] {
  return poster ? [{ type: "poster", file_path: poster }] : [];
}

// ---------------------------------------------------------------------------
// Movie

async function scrapeMovie(url: string): Promise<ScrapeResult[]> {
  const slug = slugFromUrl(url);
  const html = await fetchHtml(url);
  const root = parse(html);

  const poster = extractPoster(root, slug);
  const title = extractTitle(root);
  const rating = extractRating(root);

  const movie: Movie = {
    type: "movie",
    external_id: `filmpalast-${slug}`,
    source_url: url,
    title,
    // filmpalast has no separate original title; mirror the display title so
    // the required canonical column is always populated.
    original_title: title,
    overview: extractDescription(root),
    poster_path: poster,
    genres: extractGenres(root),
    images: posterImages(poster),
    downloads: extractDownloads(root),
    runtime: extractDuration(root),
    year: extractYear(root),
    vote_average: rating.average,
    vote_count: rating.count,
  };

  return [{ type: "movie", movie }];
}

// ---------------------------------------------------------------------------
// Series — scrape all episodes listed on the page in parallel

async function scrapeSeriesEpisode(url: string): Promise<ScrapeResult[]> {
  const slug = slugFromUrl(url);
  const seriesSlug = seriesSlugFromEpisode(slug);

  const html = await fetchHtml(url);
  const root = parse(html);

  const epLinks = Array.from(
    new Map(
      root
        .querySelectorAll(`a[href*="/stream/${seriesSlug}-s"]`)
        .map((a) => {
          const href = a.getAttribute("href") ?? "";
          const epSlug = slugFromUrl(href);
          return [epSlug, resolveUrl(href)] as const;
        })
        .filter(([s]) => isEpisodeSlug(s))
    ).values()
  );

  if (!epLinks.includes(url)) epLinks.push(url);

  const episodeDetails = await Promise.all(
    epLinks.map((epUrl) => scrapeOneEpisode(epUrl).catch(() => null))
  );

  const firstEp = episodeDetails.find((e) => e !== null);
  const rawTitle = firstEp?.rawTitle ?? seriesSlug.replace(/-/g, " ");
  const seriesName = rawTitle.replace(/\s+S\d+E\d+.*/i, "").trim() || rawTitle;
  const poster = firstEp?.poster_path ?? "";

  const series: Series = {
    type: "series",
    external_id: `filmpalast-${seriesSlug}`,
    source_url: url,
    name: seriesName,
    original_name: seriesName,
    overview: firstEp?.overview ?? "",
    poster_path: poster,
    genres: firstEp?.genres ?? [],
    images: posterImages(poster),
    year: firstEp?.year || undefined,
  };

  const items: ScrapeResult[] = [{ type: "series", series }];

  // Group episodes by season, emit series → seasons → episodes in order.
  const seasonMap = new Map<number, Episode[]>();
  for (const ep of episodeDetails) {
    if (!ep) continue;
    const list = seasonMap.get(ep.season_number) ?? [];
    list.push(ep.episode);
    seasonMap.set(ep.season_number, list);
  }

  for (const [season_number, episodes] of Array.from(seasonMap.entries()).sort(
    ([a], [b]) => a - b
  )) {
    const season: Season = {
      type: "season",
      external_id: `filmpalast-${seriesSlug}-s${season_number}`,
      source_url: `${BASE_URL}/stream/${seriesSlug}-s${String(season_number).padStart(2, "0")}e01`,
      series_external_id: `filmpalast-${seriesSlug}`,
      season_number,
      name: `Staffel ${season_number}`,
      poster_path: poster,
      images: posterImages(poster),
    };
    items.push({ type: "season", season });

    for (const episode of episodes.sort((a, b) => a.episode_number - b.episode_number)) {
      items.push({ type: "episode", episode });
    }
  }

  return items;
}

interface EpisodeDetail extends CommonFields {
  rawTitle: string;
  year: number;
  season_number: number;
  episode: Episode;
}

async function scrapeOneEpisode(url: string): Promise<EpisodeDetail> {
  const slug = slugFromUrl(url);
  const nums = parseEpisodeNumbers(slug);
  const season_number = nums?.season ?? 1;
  const episode_number = nums?.episode ?? 1;
  const seriesSlug = seriesSlugFromEpisode(slug);

  const html = await fetchHtml(url);
  const root = parse(html);

  const rawTitle = extractTitle(root) || slug.replace(/-/g, " ");
  const epName = rawTitle.replace(/.*S\d+E\d+:?\s*/i, "").trim() || rawTitle;
  const overview = extractDescription(root);
  const poster = extractPoster(root, slug);
  const genres = extractGenres(root);
  const year = extractYear(root);

  const episode: Episode = {
    type: "episode",
    external_id: `filmpalast-${slug}`,
    source_url: url,
    series_external_id: `filmpalast-${seriesSlug}`,
    season_number,
    episode_number,
    name: epName,
    overview,
    runtime: extractDuration(root),
    downloads: extractDownloads(root),
  };

  return {
    rawTitle,
    overview,
    poster_path: poster,
    genres,
    images: posterImages(poster),
    downloads: episode.downloads ?? [],
    year,
    season_number,
    episode,
  };
}

// ---------------------------------------------------------------------------
// Helpers

function extractTitle(root: HTMLElement): string {
  // The detail markup carries the clean title in an itemprop="name" element.
  const named = root.querySelector('[itemprop="name"]')?.text.trim();
  if (named) return named;
  const h1 = root.querySelector("h1")?.text.trim();
  if (h1) return h1;
  const h2 = root.querySelector("#movietitle h2, .movietitle h2, h2")?.text.trim();
  if (h2) return h2;
  // Fallback: the <title> tag, stripped of the "Film … Stream …" chrome.
  const pageTitle = root.querySelector("title")?.text ?? "";
  return pageTitle
    .replace(/^Film\s+/i, "")
    .replace(/\s+Stream\b.*$/i, "")
    .replace(/\s*[|\-–—]\s*[Ff]ilmpalast.*$/, "")
    .trim();
}

function extractDescription(root: HTMLElement): string {
  return root.querySelector('span[itemprop="description"]')?.text.trim() ?? "";
}

function extractGenres(root: HTMLElement): string[] {
  // Movie genre chips carry class "rb" and link to /search/genre/. The language
  // chip's href has a trailing slash (e.g. "/search/genre/Englisch/") — drop it.
  // The site-wide genre nav links are unclassed, so a.rb excludes them.
  const seen = new Set<string>();
  const genres: string[] = [];
  for (const a of root.querySelectorAll('a.rb[href*="/search/genre/"]')) {
    const href = a.getAttribute("href") ?? "";
    if (href.endsWith("/")) continue;
    const name = a.text.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    genres.push(name);
  }
  return genres;
}

// Rating + vote count from the star widget: <div data-rating="8.5" data-rated="124">.
function extractRating(root: HTMLElement): { average: number; count: number } {
  const el = root.querySelector("#star-rate, [data-rating][data-rated]");
  const average = parseFloat(el?.getAttribute("data-rating") ?? "");
  const count = parseInt(el?.getAttribute("data-rated") ?? "", 10);
  return {
    average: Number.isFinite(average) ? average : 0,
    count: Number.isFinite(count) ? count : 0,
  };
}

// The release year isn't in the static detail table (it's JS-injected), but the
// scene-release names linked on the page reliably embed it (e.g.
// "Matrix.Revolutions.2003.1080p…"). Pick the most common dotted year.
function extractYear(root: HTMLElement): number {
  const counts = new Map<number, number>();
  for (const a of root.querySelectorAll("a")) {
    const haystack = `${a.getAttribute("href") ?? ""} ${a.text}`;
    for (const m of haystack.matchAll(/[.\s(](19\d\d|20\d\d)[.\s)]/g)) {
      const year = parseInt(m[1], 10);
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
  }
  let best = 0;
  let bestCount = 0;
  for (const [year, count] of counts) {
    if (count > bestCount) {
      best = year;
      bestCount = count;
    }
  }
  return best;
}

function extractDuration(root: HTMLElement): number {
  // Prefer the schema.org duration: <meta itemprop="duration" content="T129M00S">.
  const iso = root.querySelector('[itemprop="duration"]')?.getAttribute("content") ?? "";
  const isoMatch = iso.match(/T(?:(\d+)H)?(\d+)M/i);
  if (isoMatch) {
    const hours = isoMatch[1] ? parseInt(isoMatch[1], 10) : 0;
    const minutes = parseInt(isoMatch[2], 10);
    return hours * 60 + minutes;
  }
  const text = root.querySelector("span.length")?.text ?? "";
  const m = text.match(/(\d+)\s*min/i);
  return m ? parseInt(m[1], 10) : 0;
}

function extractPoster(root: HTMLElement, slug: string): string {
  const img = root.querySelector(
    'img[itemprop="image"], img[src*="/files/movies/450/"], img[src*="/files/movies/"]'
  );
  const src =
    img?.getAttribute("src") ??
    root.querySelector('[itemprop="thumbnailUrl"]')?.getAttribute("content") ??
    "";
  return src ? resolveUrl(src) : `${BASE_URL}/files/movies/450/${slug}.jpg`;
}

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
