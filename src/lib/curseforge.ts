const OFFICIAL_API = 'https://api.curseforge.com/v1';
const PROXY_API = 'https://api.curse.tools/v1/cf';
const PAGE_SIZE = 50;
const CHANGELOG_CONCURRENCY = 6;

type CurseForgeMod = {
  data?: {
    downloadCount?: number;
  };
};

type CurseForgeFile = {
  id: number;
  displayName?: string;
  fileName?: string;
  fileDate?: string;
  releaseType?: number;
  isAvailable?: boolean;
  isServerPack?: boolean;
  gameVersions?: string[];
};

type FilesResponse = {
  data?: CurseForgeFile[];
  pagination?: {
    index?: number;
    pageSize?: number;
    resultCount?: number;
    totalCount?: number;
  };
};

type ChangelogResponse = {
  data?: string;
};

export type ReleaseChannel = 'release' | 'beta' | 'alpha';

export type CurseForgeRelease = {
  fileId: number;
  version: string;
  displayName: string;
  date: Date;
  minecraftVersions: string[];
  releaseType: ReleaseChannel;
  html: string;
  summary: string;
};

const downloadCache = new Map<number, number | null>();
const releaseCache = new Map<number, CurseForgeRelease[]>();

const allowedTags = new Set([
  'a',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'code',
  'pre',
  'hr',
  'blockquote',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'small',
  'sup',
  'sub',
]);

function getApiKey(): string | undefined {
  const key = import.meta.env.CURSEFORGE_API_KEY ?? process.env.CURSEFORGE_API_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : undefined;
}

function apiClient(): { base: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'semeth.wiki changelog sync',
  };
  const apiKey = getApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
    return { base: OFFICIAL_API, headers };
  }
  return { base: PROXY_API, headers };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function cfFetch(path: string): Promise<Response | null> {
  const { base, headers } = apiClient();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, { headers, redirect: 'follow' });
      if (response.status === 429 || response.status >= 500) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      return response;
    } catch {
      await sleep(400 * 2 ** attempt);
    }
  }
  return null;
}

function releaseChannel(type: number | undefined): ReleaseChannel {
  if (type === 2) {
    return 'beta';
  }
  if (type === 3) {
    return 'alpha';
  }
  return 'release';
}

export function versionFromFileName(name: string): string {
  const stripped = name.replace(/\.(jar|zip|disabled)$/i, '').trim();
  const match = stripped.match(/(\d+(?:\.\d+)+[a-zA-Z]?(?:[-.][\w]+)*)$/);
  return match?.[1] ?? stripped;
}

function minecraftVersions(gameVersions: string[] | undefined): string[] {
  return [...new Set((gameVersions ?? []).filter((version) => /^\d+\.\d+/.test(version)))];
}

export function sanitizeChangelogHtml(html: string): string {
  if (!html) {
    return '';
  }

  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  out = out.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, tag: string, attrs = '') => {
    const name = tag.toLowerCase();
    if (!allowedTags.has(name)) {
      return '';
    }

    const closing = full.startsWith('</');
    if (closing) {
      return `</${name}>`;
    }
    if (name === 'br' || name === 'hr') {
      return `<${name}>`;
    }
    if (name === 'a') {
      const href = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = href?.[1] ?? href?.[2] ?? href?.[3] ?? '';
      if (!/^(https?:\/\/|\/|#)/i.test(url) || /javascript:/i.test(url)) {
        return '<a>';
      }
      return `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noreferrer">`;
    }
    return `<${name}>`;
  });

  return out.trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function htmlToSummary(html: string): string {
  const text = decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return '';
  }
  if (text.length <= 200) {
    return text;
  }
  return `${text.slice(0, 197).replace(/\s+\S*$/, '')}…`;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchAllFiles(projectId: number): Promise<CurseForgeFile[]> {
  const files: CurseForgeFile[] = [];
  let index = 0;
  let total = Infinity;

  while (index < total) {
    const response = await cfFetch(`/mods/${projectId}/files?index=${index}&pageSize=${PAGE_SIZE}`);
    if (!response?.ok) {
      break;
    }
    const json = (await response.json()) as FilesResponse;
    const page = json.data ?? [];
    files.push(...page);
    total = json.pagination?.totalCount ?? files.length;
    if (page.length === 0) {
      break;
    }
    index += PAGE_SIZE;
  }

  return files.filter((file) => file.isAvailable !== false && !file.isServerPack);
}

async function fetchFileChangelog(projectId: number, fileId: number): Promise<string> {
  const response = await cfFetch(`/mods/${projectId}/files/${fileId}/changelog`);
  if (!response?.ok) {
    return '';
  }
  const json = (await response.json()) as ChangelogResponse;
  return typeof json.data === 'string' ? json.data : '';
}

function toRelease(file: CurseForgeFile, html: string): CurseForgeRelease {
  const displayName = file.displayName || file.fileName || `File ${file.id}`;
  const sanitized = sanitizeChangelogHtml(html);
  return {
    fileId: file.id,
    version: versionFromFileName(displayName),
    displayName,
    date: file.fileDate ? new Date(file.fileDate) : new Date(0),
    minecraftVersions: minecraftVersions(file.gameVersions),
    releaseType: releaseChannel(file.releaseType),
    html: sanitized,
    summary: htmlToSummary(sanitized) || displayName,
  };
}

export async function getProjectReleases(projectId: number): Promise<CurseForgeRelease[]> {
  if (releaseCache.has(projectId)) {
    return releaseCache.get(projectId) ?? [];
  }

  const files = await fetchAllFiles(projectId);
  const changelogs = await mapPool(files, CHANGELOG_CONCURRENCY, (file) =>
    fetchFileChangelog(projectId, file.id),
  );
  const releases = files
    .map((file, index) => toRelease(file, changelogs[index] ?? ''))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  releaseCache.set(projectId, releases);
  return releases;
}

export async function getDownloadCount(projectId: number): Promise<number | null> {
  if (downloadCache.has(projectId)) {
    return downloadCache.get(projectId) ?? null;
  }

  const response = await cfFetch(`/mods/${projectId}`);
  if (!response?.ok) {
    downloadCache.set(projectId, null);
    return null;
  }

  try {
    const json = (await response.json()) as CurseForgeMod;
    const count = json.data?.downloadCount;
    const value = typeof count === 'number' ? count : null;
    downloadCache.set(projectId, value);
    return value;
  } catch {
    downloadCache.set(projectId, null);
    return null;
  }
}

export async function getDownloadCounts(
  projectIds: number[],
): Promise<Map<number, number | null>> {
  const unique = [...new Set(projectIds)];
  const entries = await Promise.all(
    unique.map(async (id) => [id, await getDownloadCount(id)] as const),
  );
  return new Map(entries);
}
