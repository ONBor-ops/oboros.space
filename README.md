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

## Deploy to Cloudflare

The site is static. Cloudflare builds with `npm run build`, then deploys `dist/` as Worker assets (`wrangler.toml`).

### GitHub (recommended)

Connect the GitHub repo to the Worker in Cloudflare. After that, every push to `main` rebuilds and deploys.

1. Open [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages).
2. Create a Worker named `oboros`, or open it if it already exists.
3. **Settings → Builds → Connect** and authorize GitHub.
4. Pick `ONBor-ops/oboros.space`, production branch `main`.
5. Build settings:

   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Node: `22` (set `NODE_VERSION=22` under build variables if the build is not already on 22)

6. Save, then push to `main` (or **Retry** the first build).

### From this folder

```bash
npx wrangler login
npm run deploy
```

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
