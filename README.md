# Semeth Wiki

Branded guides and changelogs for Semeth’s mods and SC Final Adventure modpacks. Content is edited in the browser at `/keystatic` (local) and built as a static site.

## Local

```bash
npm install
npm run dev
```

- Site: [http://localhost:4321](http://localhost:4321)
- CMS: [http://localhost:4321/keystatic](http://localhost:4321/keystatic) (dev only — the static production build does not include the admin API)

Bugs & feedback needs the API worker as well:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:api
```

`astro dev` proxies `/api` to [http://127.0.0.1:8787](http://127.0.0.1:8787).

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

Download counts and changelogs are fetched from CurseForge during `npm run build`. A GitHub Action (`.github/workflows/refresh-curseforge.yml`) asks Cloudflare to rebuild once a day, and you can run it by hand from the Actions tab.

One-time setup:

1. Cloudflare → **Workers & Pages** → **semeth-wiki** → **Settings** → **Builds** → **Deploy Hooks** → create a hook for `main`.
2. GitHub → **semeth/semeth-wiki** → **Settings** → **Secrets and variables** → **Actions** → new secret:
   - Name: `CLOUDFLARE_DEPLOY_HOOK`
   - Value: the hook URL Cloudflare gave you

Until that secret exists, the scheduled job fails on purpose so the missing setup is obvious.

### Discord reports (one-time)

Public Bugs & feedback pages use Discord OAuth and a Cloudflare D1 database.

1. Create a Discord application at [discord.com/developers/applications](https://discord.com/developers/applications).
2. OAuth2 redirect URLs:
   - `https://semeth.wiki/api/auth/discord/callback`
   - `http://localhost:4321/api/auth/discord/callback`
3. Scope: `identify` only.
4. Cloudflare → **Workers & Pages** → **semeth-wiki** → **Settings** → **Variables and Secrets**:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `SESSION_SECRET` (long random string)
   - `ADMIN_DISCORD_IDS` (your Discord user id; comma-separated if more than one)
   - `DISCORD_WEBHOOK_URL` (optional — channel webhook so new bugs and feedback ping Discord)
   - Optional: `PUBLIC_ORIGIN` = `https://semeth.wiki` if the Worker ever sits behind another host
5. Create D1 and apply migrations:

```bash
npx wrangler d1 create semeth-wiki
```

Put the printed `database_id` in `wrangler.toml`, then:

```bash
npm run db:migrate
```

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

Do not use `changelog` or `feedback` as a guide `pageSlug` — those URLs are reserved.
