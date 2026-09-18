import { getCollection, type CollectionEntry } from 'astro:content';
import { categoryOrder } from './site';
import { getDownloadCounts, getProjectReleases, type CurseForgeRelease } from './curseforge';

export type ModEntry = CollectionEntry<'mods'>;
export type ModpackEntry = CollectionEntry<'modpacks'>;
export type GuideEntry = CollectionEntry<'guides'>;
export type ProjectKind = 'mod' | 'modpack';

export type ModWithStats = ModEntry & {
  downloads: number | null;
  latestVersion: string | null;
};

export type ModpackWithStats = ModpackEntry & {
  downloads: number | null;
  latestVersion: string | null;
};

export type ChangelogWithProject = CurseForgeRelease & {
  projectName: string;
  projectSlug: string;
  projectKind: ProjectKind;
  href: string;
  curseforgeUrl: string;
};

export async function getMods(): Promise<ModEntry[]> {
  const mods = await getCollection('mods');
  return mods.sort((a, b) => a.data.name.localeCompare(b.data.name));
}

export async function getModpacks(): Promise<ModpackEntry[]> {
  const packs = await getCollection('modpacks');
  return packs.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}

async function latestVersionsFor(projectIds: number[]): Promise<Map<number, string | null>> {
  const unique = [...new Set(projectIds)];
  const entries = await Promise.all(
    unique.map(async (id) => {
      const releases = await getProjectReleases(id);
      return [id, releases[0]?.version ?? null] as const;
    }),
  );
  return new Map(entries);
}

export async function getModsWithStats(): Promise<ModWithStats[]> {
  const mods = await getMods();
  const ids = mods.map((mod) => mod.data.curseforgeProjectId);
  const [counts, versions] = await Promise.all([getDownloadCounts(ids), latestVersionsFor(ids)]);
  return mods.map((mod) => ({
    ...mod,
    downloads: counts.get(mod.data.curseforgeProjectId) ?? null,
    latestVersion: versions.get(mod.data.curseforgeProjectId) ?? null,
  }));
}

export async function getModpacksWithStats(): Promise<ModpackWithStats[]> {
  const packs = await getModpacks();
  const ids = packs.map((pack) => pack.data.curseforgeProjectId);
  const [counts, versions] = await Promise.all([getDownloadCounts(ids), latestVersionsFor(ids)]);
  return packs.map((pack) => ({
    ...pack,
    downloads: counts.get(pack.data.curseforgeProjectId) ?? null,
    latestVersion: versions.get(pack.data.curseforgeProjectId) ?? null,
  }));
}

export async function getMod(slug: string): Promise<ModEntry | undefined> {
  const mods = await getMods();
  return mods.find((mod) => mod.id === slug);
}

export async function getModpack(slug: string): Promise<ModpackEntry | undefined> {
  const packs = await getModpacks();
  return packs.find((pack) => pack.id === slug);
}

export async function getGuidesForMod(modSlug: string): Promise<GuideEntry[]> {
  const guides = await getCollection('guides');
  return guides
    .filter((guide) => guide.data.mod === modSlug && guide.data.pageSlug !== 'changelog')
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function getGuidesForModpack(modpackSlug: string): Promise<GuideEntry[]> {
  const guides = await getCollection('guides');
  return guides
    .filter((guide) => guide.data.modpack === modpackSlug && guide.data.pageSlug !== 'changelog')
    .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function getGuide(modSlug: string, pageSlug: string): Promise<GuideEntry | undefined> {
  const guides = await getGuidesForMod(modSlug);
  return guides.find((guide) => guide.data.pageSlug === pageSlug);
}

export async function getModpackGuide(
  modpackSlug: string,
  pageSlug: string,
): Promise<GuideEntry | undefined> {
  const guides = await getGuidesForModpack(modpackSlug);
  return guides.find((guide) => guide.data.pageSlug === pageSlug);
}

export async function getChangelogsForMod(modSlug: string): Promise<CurseForgeRelease[]> {
  const mod = await getMod(modSlug);
  if (!mod) {
    return [];
  }
  return getProjectReleases(mod.data.curseforgeProjectId);
}

export async function getChangelogsForModpack(modpackSlug: string): Promise<CurseForgeRelease[]> {
  const pack = await getModpack(modpackSlug);
  if (!pack) {
    return [];
  }
  return getProjectReleases(pack.data.curseforgeProjectId);
}

export async function getAllChangelogs(): Promise<ChangelogWithProject[]> {
  const [mods, packs] = await Promise.all([getMods(), getModpacks()]);
  const projects = [
    ...mods.map((mod) => ({
      projectKind: 'mod' as const,
      projectSlug: mod.id,
      projectName: mod.data.name,
      href: `/mods/${mod.id}/changelog`,
      curseforgeUrl: mod.data.curseforgeUrl,
      projectId: mod.data.curseforgeProjectId,
    })),
    ...packs.map((pack) => ({
      projectKind: 'modpack' as const,
      projectSlug: pack.id,
      projectName: pack.data.name,
      href: `/modpacks/${pack.id}/changelog`,
      curseforgeUrl: pack.data.curseforgeUrl,
      projectId: pack.data.curseforgeProjectId,
    })),
  ];

  const grouped = await Promise.all(
    projects.map(async (project) => {
      const releases = await getProjectReleases(project.projectId);
      return releases.map((release) => ({
        ...release,
        projectKind: project.projectKind,
        projectSlug: project.projectSlug,
        projectName: project.projectName,
        href: project.href,
        curseforgeUrl: project.curseforgeUrl,
      }));
    }),
  );

  return grouped.flat().sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function groupMods<T extends ModEntry>(mods: T[]) {
  return categoryOrder
    .map((category) => ({
      category,
      mods: mods.filter((mod) => mod.data.category === category),
    }))
    .filter((group) => group.mods.length > 0);
}

export function relatedModEntries<T extends ModEntry>(
  project: { data: { relatedMods: Array<string | null> } },
  all: T[],
): T[] {
  const slugs = project.data.relatedMods.filter((slug): slug is string => Boolean(slug));
  return slugs
    .map((slug) => all.find((entry) => entry.id === slug))
    .filter((entry): entry is T => Boolean(entry));
}

export function guideHref(guide: GuideEntry): string {
  if (guide.data.modpack) {
    return `/modpacks/${guide.data.modpack}/${guide.data.pageSlug}`;
  }
  return `/mods/${guide.data.mod}/${guide.data.pageSlug}`;
}

export function modIconSrc(
  project: { data: { icon?: string } },
  kind: ProjectKind = 'mod',
): string | undefined {
  const icon = project.data.icon;
  if (!icon) {
    return undefined;
  }
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/')) {
    return icon;
  }
  return kind === 'modpack' ? `/images/modpacks/${icon}` : `/images/mods/${icon}`;
}
