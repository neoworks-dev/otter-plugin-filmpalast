<div align="center">

# otter-plugin-filmpalast

<img src="https://filmpalast.to/favicon.ico" width="64" height="64" alt="FilmPalast logo" />

**Otter plugin for [filmpalast.to](https://filmpalast.to)**

Discover, search, and scrape movies and series from the German streaming site.

![version](https://img.shields.io/badge/version-0.1.0-blue)
![capabilities](https://img.shields.io/badge/capabilities-discover%20%7C%20search%20%7C%20scrape-green)

</div>

---

## Overview

filmpalast.to is a German-language streaming site with a large catalog of movies and series. This plugin integrates it into Otter's plugin pipeline — crawling the catalog in bulk, resolving titles via search, and scraping full metadata and stream links on demand.

## Capabilities

| Capability | Description |
|------------|-------------|
| `discover` | Crawls the full catalog (movies + series), returning minimal stubs with title, poster, and source URL |
| `search` | Queries filmpalast.to's title search endpoint and returns matching items |
| `scrape` | Fetches full metadata and stream links for a given movie or episode URL |

## Scrape behavior

The scraper handles two URL shapes:

**Movie** — `/stream/<slug>`

Returns a single `Movie` with title, description, genres, year, runtime, poster, and all available stream download links.

**Episode** — `/stream/<slug>-s01e01`

Discovers all episodes linked from the page, scrapes them in parallel, and returns a full `Series → Season[] → Episode[]` tree. Each episode carries its own stream links.

## Development

Input is JSON on stdin, one call at a time:

```sh
bun run index.ts
```

```json
{ "capability": "meta", "args": {} }
```

```json
{ "capability": "search", "args": { "query": "inception", "limit": 5 } }
```

```json
{ "capability": "scrape", "args": { "url": "https://filmpalast.to/stream/inception" } }
```

Output is JSON on stdout:

```json
{ "result": { ... } }
```

or on error:

```json
{ "error": "message" }
```

## Installation

Managed automatically by Otter. When placed in the `plugins/` directory, Otter runs `bun install` on first load and invokes `bun run index.ts` per request.

To install dependencies manually:

```sh
bun install
```

## License

MIT
