---
title: How to write here
date: 2026-09-04
excerpt: A short recipe for adding and changing posts.
---

Each post is one markdown file in `src/content/posts/`.

The filename becomes the URL. `night-watch.md` is `/journal/night-watch`.

At the top of every file:

```yaml
---
title: Night watch
date: 2026-09-12
excerpt: A single sentence that appears on the journal list.
draft: false
---
```

Set `draft: true` to hide a post from the live site while you still work on it. It remains visible when you run the site locally.

The body is ordinary markdown: headings, lists, links, quotes, code. Keep the voice quiet. The page is already dark.
