import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const headers = { Accept: 'application/json', 'User-Agent': 'semeth.wiki changelog sync' };
const root = path.resolve(import.meta.dirname, '..');

function versionFromFileName(name) {
  const stripped = String(name).replace(/\.(jar|zip|disabled)$/i, '').trim();
  const match = stripped.match(/(\d+(?:\.\d+)+[a-zA-Z]?(?:[-.][\w]+)*)$/);
  return match?.[1] ?? stripped;
}

function hash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function stripHtml(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadProjects() {
  const out = [];
  for (const [kind, dir] of [
    ['mod', 'src/content/mods'],
    ['modpack', 'src/content/modpacks'],
  ]) {
    const folder = path.join(root, dir);
    for (const file of fs.readdirSync(folder).filter((name) => name.endsWith('.yaml'))) {
      const raw = fs.readFileSync(path.join(folder, file), 'utf8');
      const slug = file.replace(/\.yaml$/, '');
      const icon = raw.match(/^icon:\s*(.+)$/m)?.[1]?.trim();
      out.push({
        kind,
        slug,
        name: raw.match(/^name:\s*(.+)$/m)?.[1]?.trim(),
        tagline: raw.match(/^tagline:\s*(.+)$/m)?.[1]?.trim() ?? '',
        id: Number(raw.match(/^curseforgeProjectId:\s*(\d+)/m)?.[1]),
        iconPath: icon
          ? path.join(root, 'public/images', kind === 'modpack' ? 'modpacks' : 'mods', icon)
          : '',
      });
    }
  }
  return out;
}

const projects = loadProjects();

for (const project of projects) {
  const [modRes, filesRes, descRes] = await Promise.all([
    fetch(`https://api.curse.tools/v1/cf/mods/${project.id}?_=${Date.now()}`, { headers }),
    fetch(`https://api.curse.tools/v1/cf/mods/${project.id}/files?index=0&pageSize=5&_=${Date.now()}`, {
      headers,
    }),
    fetch(`https://api.curse.tools/v1/cf/mods/${project.id}/description?_=${Date.now()}`, { headers }),
  ]);
  const mod = (await modRes.json()).data ?? {};
  const files = (await filesRes.json()).data ?? [];
  const latest = files.find((file) => file.isAvailable !== false && !file.isServerPack);
  const version = latest ? versionFromFileName(latest.displayName || latest.fileName || '') : 'none';
  const cfSummary = String(mod.summary ?? '').trim();
  const cfDesc = stripHtml((await descRes.json()).data ?? '');
  const logoUrl = mod.logo?.url || '';
  let logoStatus = 'no-logo';
  if (logoUrl && project.iconPath && fs.existsSync(project.iconPath)) {
    const remote = Buffer.from(await (await fetch(logoUrl)).arrayBuffer());
    const local = fs.readFileSync(project.iconPath);
    logoStatus = hash(remote) === hash(local) ? 'logo-ok' : 'LOGO-CHANGED';
  }
  const flags = [
    logoStatus,
    cfSummary && cfSummary !== project.tagline ? 'SUMMARY-DIFF' : 'summary-ok',
    cfDesc ? 'desc-fetched' : 'desc-missing',
  ];
  console.log(`${flags.join('\t')}\t${project.slug}\t${version}\t${cfSummary.slice(0, 90)}`);
}
