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
  Download,
  ContentRating,
  MediaBase,
} from "@neoworks-dev/otter-sdk";

export async function scrape(url: string): Promise<ScrapeResult[]> {
  const slug = slugFromUrl(resolveUrl(url));
  if (isEpisodeSlug(slug)) return scrapeSeriesEpisode(resolveUrl(url));
  return scrapeMovie(resolveUrl(url));
}

// ---------------------------------------------------------------------------
// Movie

async function scrapeMovie(url: string): Promise<ScrapeResult[]> {
  const slug = slugFromUrl(url);
  const html = await fetchHtml(url);
  const root = parse(html);

  const title = extractTitle(root);
  const description = extractDescription(root);
  const genres = extractGenres(root);
  const year = extractYear(root);
  const duration = extractDuration(root);
  const poster = extractPoster(root, slug);
  const content_rating = extractContentRating(root);
  const downloads = extractDownloads(root);

  const base: MediaBase = {
    type: "movie",
    title,
    description,
    source_url: url,
    external_id: `filmpalast-${slug}`,
    poster,
    genres,
    tags: [],
    cast: [],
    images: poster ? [{ url: poster }] : [],
    downloads,
    content_rating,
  };

  const movie: Movie = {
    ...base,
    type: "movie",
    year,
    duration_minutes: duration,
    trailer_urls: [],
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
  const seriesTitle = rawTitle.replace(/\s+S\d+E\d+.*/i, "").trim() || rawTitle;

  const description = firstEp?.description ?? "";
  const poster = firstEp?.poster ?? "";
  const genres = firstEp?.genres ?? [];
  const year = firstEp?.year ?? 0;
  const content_rating = firstEp?.content_rating ?? {
    nsfw: false,
    rating: "NR",
    warnings: [],
  };

  const seriesBase: MediaBase = {
    type: "series",
    title: seriesTitle,
    description,
    source_url: url,
    external_id: `filmpalast-${seriesSlug}`,
    poster,
    genres,
    tags: [],
    cast: [],
    images: poster ? [{ url: poster }] : [],
    downloads: [],
    content_rating,
  };

  const series: Series = {
    ...seriesBase,
    type: "series",
    year,
    status: "ongoing",
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

  for (const [season_number, episodes] of Array.from(seasonMap.entries()).sort(([a], [b]) => a - b)) {
    const seasonBase: MediaBase = {
      type: "season",
      title: `Staffel ${season_number}`,
      description: "",
      source_url: `${BASE_URL}/stream/${seriesSlug}-s${String(season_number).padStart(2, "0")}e01`,
      external_id: `filmpalast-${seriesSlug}-s${season_number}`,
      poster,
      genres: [],
      tags: [],
      cast: [],
      images: [],
      downloads: [],
      content_rating: { nsfw: false, rating: "NR", warnings: [] },
    };
    const season: Season = {
      ...seasonBase,
      type: "season",
      series_external_id: `filmpalast-${seriesSlug}`,
      number: season_number,
    };
    items.push({ type: "season", season });

    for (const episode of episodes.sort((a, b) => a.number - b.number)) {
      items.push({ type: "episode", episode });
    }
  }

  return items;
}

interface EpisodeDetail {
  rawTitle: string;
  description: string;
  poster: string;
  genres: string[];
  year: number;
  content_rating: ContentRating;
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
  const epTitle = rawTitle.replace(/.*S\d+E\d+:?\s*/i, "").trim() || rawTitle;
  const description = extractDescription(root);
  const poster = extractPoster(root, slug);
  const genres = extractGenres(root);
  const year = extractYear(root);
  const duration = extractDuration(root);
  const content_rating = extractContentRating(root);
  const downloads = extractDownloads(root);

  const epBase: MediaBase = {
    type: "episode",
    title: epTitle,
    description,
    source_url: url,
    external_id: `filmpalast-${slug}`,
    poster,
    genres: [],
    tags: [],
    cast: [],
    images: [],
    downloads,
    content_rating: { nsfw: false, rating: "NR", warnings: [] },
  };

  const episode: Episode = {
    ...epBase,
    type: "episode",
    series_external_id: `filmpalast-${seriesSlug}`,
    season_number,
    number: episode_number,
    duration_minutes: duration,
  };

  return { rawTitle, description, poster, genres, year, content_rating, season_number, episode };
}

// ---------------------------------------------------------------------------
// Helpers

function extractTitle(root: HTMLElement): string {
  const h1 = root.querySelector("h1")?.text.trim();
  if (h1) return h1;
  const h2 = root.querySelector("#movietitle h2, .movietitle h2, h2")?.text.trim();
  if (h2) return h2;
  return (
    root
      .querySelector("title")
      ?.text.replace(/\s*[|\-–—]\s*[Ff]ilmpalast.*$/, "")
      .trim() ?? ""
  );
}

function extractDescription(root: HTMLElement): string {
  return root.querySelector('span[itemprop="description"]')?.text.trim() ?? "";
}

function extractGenres(root: HTMLElement): string[] {
  return root
    .querySelectorAll('a[href*="/search/genre/"]')
    .map((a) => a.text.trim())
    .filter(Boolean);
}

function extractYear(root: HTMLElement): number {
  const text = root.querySelector("span.releasedate")?.text ?? "";
  const m = text.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : 0;
}

function extractDuration(root: HTMLElement): number {
  const text = root.querySelector("span.length")?.text ?? "";
  const m = text.match(/(\d+)\s*min/i);
  return m ? parseInt(m[1], 10) : 0;
}

function extractPoster(root: HTMLElement, slug: string): string {
  const img = root.querySelector(
    'img[src*="/files/movies/450/"], img[src*="/files/movies/"]'
  );
  const src = img?.getAttribute("src") ?? "";
  return src ? resolveUrl(src) : `${BASE_URL}/files/movies/450/${slug}.jpg`;
}

function extractContentRating(root: HTMLElement): ContentRating {
  // filmpalast.to doesn't expose FSK ratings; default NR.
  return { nsfw: false, rating: "NR", warnings: [] };
}

function extractDownloads(root: HTMLElement): Download[] {
  const results: Download[] = [];
  for (const a of root.querySelectorAll('a[class="button rb"], a.button.rb')) {
    const url = a.getAttribute("href") ?? "";
    if (!url.startsWith("http")) continue;

    const li = a.closest("li");
    const rawText = li?.text.trim() ?? "";
    const label =
      rawText.replace(/\bPlay\b/gi, "").trim() || providerFromUrl(url);

    results.push({
      label,
      url,
      quality: label.includes("HD") ? "HD" : "",
      language: "de",
      format: "",
    });
  }
  return results;
}
