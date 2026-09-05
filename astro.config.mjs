// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://oboros.space",
  compressHTML: true,
  build: {
    inlineStylesheets: "auto",
  },
});
