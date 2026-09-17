import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const category = z.enum(['magic', 'adventure', 'packs', 'addons', 'streaming']);
const section = z.enum(['getting-started', 'gameplay', 'config', 'faq']);

const mods = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml}', base: './src/content/mods' }),
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    category,
    accent: z.string().default('#d4a54a'),
    loader: z.string().default('NeoForge'),
    minecraftVersions: z.array(z.string()).default([]),
    curseforgeUrl: z.string().url(),
    curseforgeProjectId: z.number().int(),
    requirements: z.array(z.string()).default([]),
    relatedMods: z.array(z.string().nullable()).default([]),
    icon: z.string().optional(),
    banner: z.string().optional(),
  }),
});

const modpacks = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml}', base: './src/content/modpacks' }),
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    accent: z.string().default('#d4a54a'),
    loader: z.string().default('NeoForge'),
    minecraftVersions: z.array(z.string()).default([]),
    curseforgeUrl: z.string().url(),
    curseforgeProjectId: z.number().int(),
    requirements: z.array(z.string()).default([]),
    relatedMods: z.array(z.string().nullable()).default([]),
    icon: z.string().optional(),
    order: z.number().default(100),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.{mdoc,md}', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    pageSlug: z.string(),
    mod: z.string().nullable().optional(),
    modpack: z.string().nullable().optional(),
    section,
    order: z.number().default(1),
  }),
});

export const collections = { mods, modpacks, guides };
