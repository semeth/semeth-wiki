export const site = {
  name: 'Semeth Wiki',
  tagline: 'Guides and changelogs for Semeth’s mods and modpacks.',
  description:
    'Guides and changelogs for every SemSemSem project — NeoForge mods plus the SC Final Adventure modpacks.',
  author: 'Semeth',
  curseforgeAuthor: 'https://www.curseforge.com/members/semsemsem/projects',
  url: 'https://semeth.wiki',
};

export const categoryLabels = {
  magic: 'Magic',
  adventure: 'Adventure & worlds',
  packs: 'Packs & servers',
  addons: 'Addons',
  streaming: 'Streaming',
} as const;

export const categoryOrder = ['magic', 'adventure', 'packs', 'addons', 'streaming'] as const;

export const sectionLabels = {
  'getting-started': 'Getting started',
  gameplay: 'Gameplay',
  config: 'Config',
  faq: 'FAQ',
} as const;
