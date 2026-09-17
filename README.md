# Semeth Wiki

Branded guides and changelogs for Semeth’s mods and SC Final Adventure modpacks. Content is edited in the browser at `/keystatic` (local) and built as a static site.

## Local

```bash
npm install
npm run dev
```

- Site: [http://localhost:4321](http://localhost:4321)
- CMS: [http://localhost:4321/keystatic](http://localhost:4321/keystatic) (dev only — the static production build does not include the admin API)

Optional: copy `.env.example` to `.env` and set `CURSEFORGE_API_KEY` from [console.curseforge.com](https://console.curseforge.com/). Without the key, download counts and changelogs still load at build time through a public CurseForge API proxy.

```bash
npm run build
npm run preview
```

`build` runs Pagefind over `dist` so `/search` gets full-text results.

## Cloudflare (`semeth.wiki`)

The current Cloudflare dashboard creates a **Worker** from Git (no output-directory field). `wrangler.toml` tells Wrangler to publish `dist`.

1. **Create application** → import `semeth/semeth-wiki`.
2. Build command: `npm run build`
3. Deploy command: `npx wrangler deploy`
4. Advanced: `NODE_VERSION` = `22`
5. After it is live, attach `semeth.wiki` under Custom domains.

Counts and changelogs refresh on each rebuild. Add a daily Cron Trigger that hits the deploy hook if you want counts without content edits.

## Keystatic on the live site (GitHub mode)

Local storage only works in `astro dev`. To edit on `semeth.wiki`:

1. Create a GitHub App (or OAuth App) with repo contents read/write on this repository.
2. Switch `storage` in `keystatic.config.ts` to:

```ts
storage: {
  kind: 'github',
  repo: 'YOUR_ORG/semeth.wiki',
},
```

3. Set `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, and `KEYSTATIC_SECRET` in Cloudflare.
4. Add an Astro adapter that can run Keystatic’s admin API (Cloudflare or Node). Static-only Pages hosting keeps `/keystatic` as a local-dev tool.

Until that is wired, edit via `npm run dev` → `/keystatic`, then commit.

## Content model

| Collection | Path | Purpose |
| --- | --- | --- |
| Mods | `src/content/mods/` | Name, CurseForge URL + project ID, requirements, related mods |
| Modpacks | `src/content/modpacks/` | SC Final Adventure packs; hubs under `/modpacks/[slug]` |
| Guides | `src/content/guides/` | Articles under `/mods/[mod]/[page]` or `/modpacks/[pack]/[page]` |
| Changelogs | CurseForge files | Pulled at build for each project’s `/changelog` page and `/updates` |

Do not use `changelog` as a guide `pageSlug` — that URL is reserved.
