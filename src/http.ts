export const BASE_URL = "https://filmpalast.to";

export function resolveUrl(path: string): string {
  if (path.startsWith("http")) return path;
  if (path.startsWith("//")) return "https:" + path;
  return BASE_URL + (path.startsWith("/") ? path : "/" + path);
}

export function slugFromUrl(url: string): string {
  return resolveUrl(url).split("/stream/").pop()?.replace(/\/.*$/, "") ?? "";
}

export function isEpisodeSlug(slug: string): boolean {
  return /[-_]s\d+e\d+$/i.test(slug);
}

export function seriesSlugFromEpisode(slug: string): string {
  return slug.replace(/[-_]s\d+e\d+$/i, "");
}

export function parseEpisodeNumbers(slug: string): { season: number; episode: number } | null {
  const m = slug.match(/[-_]s(\d+)e(\d+)$/i);
  if (!m) return null;
  return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
}

export function providerFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "unknown";
  }
}
