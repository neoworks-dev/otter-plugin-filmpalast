import { runPlugin } from "@neoworks-dev/otter-sdk";
import { findStreams } from "./src/streams.ts";

runPlugin({
  meta: {
    name: "filmpalast",
    display_name: "FilmPalast",
    description: "German streaming site — finds playable streams for movies and episodes on filmpalast.to",
    icon: "https://filmpalast.to/favicon.ico",
    version: "0.3.0",
    capabilities: ["streams"],
  },
  streams: (args) => findStreams(args),
});
