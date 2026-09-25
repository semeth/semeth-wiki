export const MOD_SLUGS = [
  'adventure-engine',
  'bass-sanctum',
  'cataclysm-dedust',
  'epicquest-dungeoning',
  'epicquest-hub',
  'eventmaker',
  'leylines',
  'spell-actionbar',
  'spell-codex',
  'spell-codex-ars-compat',
  'structure-encyclopedia',
  'tikfinitok',
] as const;

export const MODPACK_SLUGS = [
  'sc-final-adventure',
  'sc-final-adventure-arcana',
  'sc-final-adventure-machines',
  'sc-final-adventure-mechanical-genesis',
] as const;

export type FeedbackProjectKind = 'mod' | 'modpack';
export type FeedbackReportType = 'bug' | 'feedback';
export type FeedbackReportStatus = 'open' | 'closed';

export type FeedbackAuthor = {
  username: string;
  avatar: string | null;
};

export type FeedbackReply = {
  id: number;
  body: string;
  createdAt: number;
  author: FeedbackAuthor;
};

export type FeedbackReport = {
  id: number;
  type: FeedbackReportType;
  title: string;
  body: string;
  minecraftVersion: string | null;
  modVersion: string | null;
  status: FeedbackReportStatus;
  createdAt: number;
  author: FeedbackAuthor;
  replies: FeedbackReply[];
  mine: boolean;
};

export type FeedbackSession = {
  username: string;
  avatar: string | null;
  isAdmin: boolean;
};

export function isKnownProject(kind: string, slug: string): kind is FeedbackProjectKind {
  if (kind === 'mod') {
    return (MOD_SLUGS as readonly string[]).includes(slug);
  }
  if (kind === 'modpack') {
    return (MODPACK_SLUGS as readonly string[]).includes(slug);
  }
  return false;
}
