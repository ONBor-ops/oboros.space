# oboros.space

A dark, cinematic two-page site: a scroll-driven flight through nearby worlds, then a quiet journal.

## Pages

- `/` — cover. Scroll to fly past planets.
- `/journal` — writing. Each markdown file is a post.

## Add or change a post

Create a file in `src/content/posts/`. The filename is the URL.

`src/content/posts/night-watch.md` → `https://oboros.space/journal/night-watch`

```md
---
title: Night watch
date: 2026-09-12
excerpt: One sentence for the list page.
draft: false
---

Your writing goes here. Ordinary markdown.
```

- `draft: true` hides the post on the live build. It still shows when you run `npm run dev`.
- Edit an existing file to change it. Delete the file to remove it.
- Push to git (if Pages is connected) or run `npm run deploy`.

## Local

```bash
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Deploy to Cloudflare Pages

The site is static. Cloudflare Pages is the intended host.

### First time, from this folder

1. Install the CLI once: `npm install --save-dev wrangler`
2. Log in: `npx wrangler login`
3. Build and ship:

```bash
npm run deploy
```

That creates a Pages project named `oboros` and prints a `*.pages.dev` URL.

### Or connect GitHub

1. Push this folder to a GitHub repository.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Node version: `22` or later.

Every push rebuilds the site, including new journal posts.

### Point blog.oboros.space at it (replace the old site)

1. In the Pages project: **Custom domains → Set up a domain**.
2. Add `blog.oboros.space`.
3. If that hostname is already attached to the old Astro starter project, remove it there first: old project → **Custom domains → Remove**.
4. If DNS is on Cloudflare, the `CNAME` is created for you. If not, set:

   `CNAME blog` → `oboros.pages.dev` (or the URL Cloudflare shows)

5. Optional: also add `oboros.space` and `www.oboros.space` on the same project if you want the apex to match.

SSL is automatic once the domain is attached. DNS changes usually land in a few minutes.

## Stack

Astro, Three.js, markdown content collections. No CMS, no database.
