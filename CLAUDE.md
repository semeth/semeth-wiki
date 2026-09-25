## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

For Bugs & feedback pages, also run the API worker (proxied from `/api` on port 4321):

```
npm run db:migrate:local
npm run dev:api
```

Copy `.dev.vars.example` to `.dev.vars` and fill Discord app values. Redirect URL: `http://localhost:4321/api/auth/discord/callback`.

## CurseForge scans

When asked to scan CurseForge or update the wiki from it, compare all of the following against `src/content` and `public/images`:

- Latest files / changelogs / download counts
- Project summary and long description
- Logo image (CurseForge avatar vs the local icon file)

Update yaml copy and icons when those change. Changelog pages refresh on the next production build.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
