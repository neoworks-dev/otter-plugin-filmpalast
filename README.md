# otter-plugin-filmpalast

[Otter](https://github.com/neoworks-dev/otter) plugin for [filmpalast.to](https://filmpalast.to) — a German streaming site hosting movies and series.

## Capabilities

| Capability | Description |
|------------|-------------|
| `discover` | Crawls the full movie and series catalog, returning minimal stubs |
| `search` | Queries filmpalast.to's title search endpoint |
| `scrape` | Fetches full metadata and stream links for a movie or series episode URL |

## Scrape behavior

- **Movie URL** (`/stream/<slug>`) — returns one `Movie` with title, description, genres, year, duration, poster, and stream download links
- **Episode URL** (`/stream/<slug>-s01e01`) — scrapes all episodes visible on the page in parallel, returning a `Series` → `Season[]` → `Episode[]` tree with stream links per episode

## Install

This plugin is loaded automatically by Otter when placed in the `plugins/` directory. Bun and dependencies are managed by the Otter backend.

```sh
bun install
```

## Development

```sh
bun run index.ts
```

Input is read from stdin as JSON:

```json
{ "capability": "meta", "args": {} }
{ "capability": "search", "args": { "query": "inception", "limit": 5 } }
{ "capability": "scrape", "args": { "url": "https://filmpalast.to/stream/inception" } }
```

## License

MIT
