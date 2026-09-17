import { config, fields, collection } from '@keystatic/core';

const categoryOptions = [
  { label: 'Magic', value: 'magic' },
  { label: 'Adventure & worlds', value: 'adventure' },
  { label: 'Packs & servers', value: 'packs' },
  { label: 'Addons', value: 'addons' },
  { label: 'Streaming', value: 'streaming' },
] as const;

const sectionOptions = [
  { label: 'Getting started', value: 'getting-started' },
  { label: 'Gameplay', value: 'gameplay' },
  { label: 'Config', value: 'config' },
  { label: 'FAQ', value: 'faq' },
] as const;

export default config({
  storage: {
    kind: 'local',
  },
  collections: {
    mods: collection({
      label: 'Mods',
      slugField: 'name',
      path: 'src/content/mods/*',
      format: { data: 'yaml' },
      schema: {
        name: fields.slug({ name: { label: 'Name' } }),
        tagline: fields.text({ label: 'Tagline', validation: { isRequired: true } }),
        description: fields.text({
          label: 'Overview',
          multiline: true,
          validation: { isRequired: true },
        }),
        category: fields.select({
          label: 'Category',
          options: [...categoryOptions],
          defaultValue: 'magic',
        }),
        accent: fields.text({
          label: 'Accent color (hex)',
          defaultValue: '#d4a54a',
        }),
        loader: fields.text({ label: 'Loader', defaultValue: 'NeoForge' }),
        minecraftVersions: fields.array(fields.text({ label: 'Version' }), {
          label: 'Minecraft versions',
          itemLabel: (props) => props.value,
        }),
        curseforgeUrl: fields.url({
          label: 'CurseForge URL',
          validation: { isRequired: true },
        }),
        curseforgeProjectId: fields.integer({
          label: 'CurseForge project ID',
          validation: { isRequired: true },
        }),
        requirements: fields.array(fields.text({ label: 'Requirement' }), {
          label: 'Requirements',
          itemLabel: (props) => props.value,
        }),
        relatedMods: fields.array(
          fields.relationship({
            label: 'Related mod',
            collection: 'mods',
          }),
          {
            label: 'Related mods',
            itemLabel: (props) => props.value ?? 'Select a mod',
          },
        ),
        icon: fields.image({
          label: 'Icon',
          directory: 'public/images/mods',
          publicPath: '/images/mods/',
        }),
        banner: fields.image({
          label: 'Banner',
          directory: 'public/images/banners',
          publicPath: '/images/banners/',
        }),
      },
    }),
    modpacks: collection({
      label: 'Modpacks',
      slugField: 'name',
      path: 'src/content/modpacks/*',
      format: { data: 'yaml' },
      schema: {
        name: fields.slug({ name: { label: 'Name' } }),
        tagline: fields.text({ label: 'Tagline', validation: { isRequired: true } }),
        description: fields.text({
          label: 'Overview',
          multiline: true,
          validation: { isRequired: true },
        }),
        accent: fields.text({
          label: 'Accent color (hex)',
          defaultValue: '#d4a54a',
        }),
        loader: fields.text({ label: 'Loader', defaultValue: 'NeoForge' }),
        minecraftVersions: fields.array(fields.text({ label: 'Version' }), {
          label: 'Minecraft versions',
          itemLabel: (props) => props.value,
        }),
        curseforgeUrl: fields.url({
          label: 'CurseForge URL',
          validation: { isRequired: true },
        }),
        curseforgeProjectId: fields.integer({
          label: 'CurseForge project ID',
          validation: { isRequired: true },
        }),
        requirements: fields.array(fields.text({ label: 'Requirement' }), {
          label: 'Requirements',
          itemLabel: (props) => props.value,
        }),
        relatedMods: fields.array(
          fields.relationship({
            label: 'Related mod',
            collection: 'mods',
          }),
          {
            label: 'Related mods',
            itemLabel: (props) => props.value ?? 'Select a mod',
          },
        ),
        icon: fields.image({
          label: 'Icon',
          directory: 'public/images/modpacks',
          publicPath: '/images/modpacks/',
        }),
        order: fields.integer({ label: 'Homepage order', defaultValue: 100 }),
      },
    }),
    guides: collection({
      label: 'Guides',
      slugField: 'title',
      path: 'src/content/guides/*',
      format: { contentField: 'body' },
      schema: {
        title: fields.slug({
          name: { label: 'Title' },
          slug: {
            label: 'File slug',
            description: 'Must be unique across all guides, e.g. spell-actionbar-getting-started',
          },
        }),
        pageSlug: fields.text({
          label: 'URL slug',
          description: 'Used in /mods/[mod]/[slug] or /modpacks/[pack]/[slug]. Do not use "changelog".',
          validation: { isRequired: true },
        }),
        mod: fields.relationship({
          label: 'Mod',
          collection: 'mods',
        }),
        modpack: fields.relationship({
          label: 'Modpack',
          collection: 'modpacks',
        }),
        section: fields.select({
          label: 'Section',
          options: [...sectionOptions],
          defaultValue: 'getting-started',
        }),
        order: fields.integer({ label: 'Order', defaultValue: 1 }),
        body: fields.markdoc({ label: 'Body' }),
      },
    }),
  },
});
