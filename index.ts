import { runPlugin } from "@neoworks-dev/otter-sdk";
import { discover } from "./src/discover.ts";
import { scrape } from "./src/scrape.ts";
import { search } from "./src/search.ts";

runPlugin({
  meta: {
    name: "filmpalast",
    display_name: "FilmPalast",
    description: "German streaming site — discover and scrape movies from filmpalast.to",
    icon: "https://filmpalast.to/favicon.ico",
    version: "0.1.0",
    capabilities: ["discover", "scrape", "search"],
  },
  discover: (query, limit) => discover(query, limit),
  scrape: (url) => scrape(url),
  search: ({ query, limit }) => search(query, limit),
});
