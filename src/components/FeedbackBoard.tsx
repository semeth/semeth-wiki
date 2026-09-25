import { useEffect, useState, type FormEvent } from 'react';
import { formatDate } from '../lib/format';
import type {
  FeedbackProjectKind,
  FeedbackReply,
  FeedbackReport,
  FeedbackReportType,
  FeedbackSession,
} from '../lib/feedback';

interface Props {
  kind: FeedbackProjectKind;
  slug: string;
  name: string;
}

const errors: Record<string, string> = {
  discord: 'Discord sign-in did not finish. Try again.',
  auth_not_configured: 'Discord sign-in is not set up on this site yet.',
};

export default function FeedbackBoard({ kind, slug, name }: Props) {
  const [user, setUser] = useState<FeedbackSession | null>(null);
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [replying, setReplying] = useState<number | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [type, setType] = useState<FeedbackReportType>('feedback');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [minecraftVersion, setMinecraftVersion] = useState('');
  const [modVersion, setModVersion] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('error');
    if (code && errors[code]) {
      setAuthError(errors[code]);
      params.delete('error');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
    }

    let cancelled = false;
    async function load() {
      try {
        const [meRes, listRes] = await Promise.all([
          fetch('/api/me'),
          fetch(`/api/reports?kind=${encodeURIComponent(kind)}&project=${encodeURIComponent(slug)}`),
        ]);
        if (!listRes.ok) {
          throw new Error('list');
        }
        const meJson = (await meRes.json()) as { user: FeedbackSession | null };
        const listJson = (await listRes.json()) as { reports: FeedbackReport[] };
        if (cancelled) {
          return;
        }
        setUser(meJson.user);
        setReports(listJson.reports);
        setLoadError(null);
      } catch {
        if (!cancelled) {
          setLoadError('Could not load reports. Start the API worker if you are on localhost.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, slug]);

  function signIn() {
    const next = new URL(window.location.href);
    next.searchParams.delete('error');
    const returnTo = `${next.pathname}${next.search}`;
    window.location.href = `/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          project: slug,
          type,
          title,
          body,
          minecraftVersion,
          modVersion,
        }),
      });
      const data = (await res.json()) as { error?: string; report?: FeedbackReport };
      if (!res.ok || !data.report) {
        setFormError(data.error ?? 'Could not send that report');
        return;
      }
      setReports((current) => [data.report!, ...current]);
      setTitle('');
      setBody('');
      setMinecraftVersion('');
      setModVersion('');
    } catch {
      setFormError('Could not send that report');
    } finally {
      setSubmitting(false);
    }
  }

  async function sendReply(id: number) {
    const text = (replyDrafts[id] ?? '').trim();
    if (text.length < 4) {
      return;
    }
    setReplying(id);
    try {
      const res = await fetch(`/api/reports/${id}/replies`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json()) as { error?: string; reply?: FeedbackReply };
      if (!res.ok || !data.reply) {
        return;
      }
      setReports((current) =>
        current.map((report) =>
          report.id === id ? { ...report, replies: [...report.replies, data.reply!] } : report,
        ),
      );
      setReplyDrafts((current) => ({ ...current, [id]: '' }));
    } finally {
      setReplying(null);
    }
  }

  async function patchReport(id: number, payload: { status?: 'open' | 'closed'; hidden?: true }) {
    const res = await fetch(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return;
    }
    if (payload.hidden) {
      setReports((current) => current.filter((report) => report.id !== id));
      return;
    }
    if (payload.status) {
      setReports((current) =>
        current.map((report) => (report.id === id ? { ...report, status: payload.status! } : report)),
      );
    }
  }

  const fieldClass =
    'w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-parchment placeholder:text-muted focus:border-gold/60 focus:outline-none';
  const ghostButton =
    'rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-gold/60 hover:text-gold-soft';

  return (
    <div className="mt-8 space-y-8" data-pagefind-ignore>
      {authError && <p className="rounded-xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm">{authError}</p>}

      <section className="rounded-2xl border border-line bg-surface/60 p-5">
        {user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {user.avatar && (
                <img src={user.avatar} alt="" width={36} height={36} className="h-9 w-9 rounded-full" />
              )}
              <div>
                <p className="text-sm text-parchment">{user.username}</p>
                <p className="text-xs text-muted">{user.isAdmin ? 'Signed in · admin' : 'Signed in with Discord'}</p>
              </div>
            </div>
            <button type="button" onClick={() => void signOut()} className={ghostButton}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Sign in with Discord to leave public feedback or a private bug report for {name}.
            </p>
            <button
              type="button"
              onClick={signIn}
              className="rounded-full bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752c4]"
            >
              Continue with Discord
            </button>
          </div>
        )}
      </section>

      {user && (
        <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-2xl border border-line bg-surface/60 p-5">
          <p className="text-xs text-muted">
            Feedback is public. Bug reports are private — only you and Semeth can see them.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['feedback', 'bug'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={
                  type === value
                    ? 'rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-obsidian'
                    : 'rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-gold-soft'
                }
              >
                {value === 'bug' ? 'Bug' : 'Feedback'}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Title</span>
            <input
              className={fieldClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Details</span>
            <textarea
              className={`${fieldClass} min-h-32`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={4000}
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Minecraft version</span>
              <input
                className={fieldClass}
                value={minecraftVersion}
                onChange={(event) => setMinecraftVersion(event.target.value)}
                maxLength={32}
                placeholder="Optional"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
                {kind === 'modpack' ? 'Pack version' : 'Mod version'}
              </span>
              <input
                className={fieldClass}
                value={modVersion}
                onChange={(event) => setModVersion(event.target.value)}
                maxLength={32}
                placeholder="Optional"
              />
            </label>
          </div>
          {formError && <p className="text-sm text-gold">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-obsidian hover:bg-gold-soft disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Submit'}
          </button>
        </form>
      )}

      <section>
        <h2 className="font-display text-3xl text-white">Feedback</h2>
        {loading && <p className="mt-4 text-sm text-muted">Loading…</p>}
        {loadError && <p className="mt-4 text-sm text-gold">{loadError}</p>}
        {!loading && !loadError && reports.filter((report) => report.type === 'feedback').length === 0 && (
          <p className="mt-4 text-sm text-muted">No public feedback yet.</p>
        )}
        <ul className="mt-4 space-y-4">
          {reports.filter((report) => report.type === 'feedback').map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              user={user}
              fieldClass={fieldClass}
              ghostButton={ghostButton}
              replyDraft={replyDrafts[report.id] ?? ''}
              replying={replying === report.id}
              onDraft={(value) => setReplyDrafts((current) => ({ ...current, [report.id]: value }))}
              onReply={() => void sendReply(report.id)}
              onPatch={patchReport}
            />
          ))}
        </ul>
      </section>

      {(user?.isAdmin || reports.some((report) => report.type === 'bug')) && (
        <section>
          <h2 className="font-display text-3xl text-white">{user?.isAdmin ? 'Bug reports' : 'Your bug reports'}</h2>
          <p className="mt-2 text-sm text-muted">Private — not shown to other visitors.</p>
          {reports.filter((report) => report.type === 'bug').length === 0 && (
            <p className="mt-4 text-sm text-muted">No private bug reports yet.</p>
          )}
          <ul className="mt-4 space-y-4">
            {reports.filter((report) => report.type === 'bug').map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                user={user}
                fieldClass={fieldClass}
                ghostButton={ghostButton}
                replyDraft={replyDrafts[report.id] ?? ''}
                replying={replying === report.id}
                onDraft={(value) => setReplyDrafts((current) => ({ ...current, [report.id]: value }))}
                onReply={() => void sendReply(report.id)}
                onPatch={patchReport}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReportCard({
  report,
  user,
  fieldClass,
  ghostButton,
  replyDraft,
  replying,
  onDraft,
  onReply,
  onPatch,
}: {
  report: FeedbackReport;
  user: FeedbackSession | null;
  fieldClass: string;
  ghostButton: string;
  replyDraft: string;
  replying: boolean;
  onDraft: (value: string) => void;
  onReply: () => void;
  onPatch: (id: number, payload: { status?: 'open' | 'closed'; hidden?: true }) => void;
}) {
  const [open, setOpen] = useState(false);
  const canReply = Boolean(user?.isAdmin || report.mine);
  const replyLabel =
    report.replies.length === 1 ? '1 reply' : report.replies.length > 1 ? `${report.replies.length} replies` : null;

  return (
    <li className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface/60 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-parchment">{report.title}</p>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
            {report.author.avatar && (
              <img src={report.author.avatar} alt="" width={16} height={16} className="h-4 w-4 rounded-full" />
            )}
            <span className="truncate">{report.author.username}</span>
            <span>· {formatDate(new Date(report.createdAt))}</span>
            <span>{report.status === 'closed' ? 'Closed' : 'Open'}</span>
            {report.type === 'bug' && <span>Private</span>}
            {replyLabel && <span>{replyLabel}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {user?.isAdmin && open && (
            <>
              <button
                type="button"
                className={ghostButton}
                onClick={() => onPatch(report.id, { status: report.status === 'closed' ? 'open' : 'closed' })}
              >
                {report.status === 'closed' ? 'Reopen' : 'Close'}
              </button>
              <button type="button" className={ghostButton} onClick={() => onPatch(report.id, { hidden: true })}>
                Hide
              </button>
            </>
          )}
          <button type="button" className={ghostButton} onClick={() => setOpen((current) => !current)}>
            {open ? 'Show less' : 'Show more'}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="whitespace-pre-wrap break-words text-sm text-parchment/90">{report.body}</p>
          {(report.minecraftVersion || report.modVersion) && (
            <p className="mt-3 text-xs text-muted">
              {report.minecraftVersion && <span>Minecraft {report.minecraftVersion}</span>}
              {report.minecraftVersion && report.modVersion && <span> · </span>}
              {report.modVersion && <span>Version {report.modVersion}</span>}
            </p>
          )}
          {report.replies.length > 0 && (
            <ul className="mt-4 space-y-3 border-t border-line pt-4">
              {report.replies.map((reply) => (
                <li key={reply.id}>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {reply.author.avatar && (
                      <img src={reply.author.avatar} alt="" width={16} height={16} className="h-4 w-4 rounded-full" />
                    )}
                    <span>{reply.author.username}</span>
                    <span>· {formatDate(new Date(reply.createdAt))}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-parchment/90">{reply.body}</p>
                </li>
              ))}
            </ul>
          )}
          {canReply && (
            <div className="mt-4 space-y-2 border-t border-line pt-4">
              <textarea
                className={`${fieldClass} min-h-20`}
                value={replyDraft}
                onChange={(event) => onDraft(event.target.value)}
                maxLength={4000}
                placeholder="Write a reply"
              />
              <button
                type="button"
                disabled={replying}
                onClick={onReply}
                className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-obsidian hover:bg-gold-soft disabled:opacity-60"
              >
                {replying ? 'Sending…' : 'Reply'}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
