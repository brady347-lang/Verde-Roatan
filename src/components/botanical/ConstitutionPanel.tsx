import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, ScrollText, Sparkles } from 'lucide-react';
import { Language } from '../../types';
import {
  ConstitutionAmendment, ConstitutionRule, StudyStats, decideConstitutionAmendment, editConstitutionRule,
  listConstitutionAmendments, listConstitutionRules, proposeConstitutionAmendments, studyConstitutionLessons
} from '../../lib/constitutionApi';

type Tab = 'rules' | 'lessons' | 'history';
const card = 'rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 flex flex-col gap-2 min-w-0';
const btn = 'min-h-[40px] rounded-xl px-3 text-[12px] font-extrabold disabled:opacity-50';
const input = 'w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--palm)]';

export function ConstitutionPanel({ lang, accessToken }: { lang: Language; accessToken?: string }) {
  const es = lang === 'es';
  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<ConstitutionRule[]>([]);
  const [pending, setPending] = useState<ConstitutionAmendment[]>([]);
  const [decided, setDecided] = useState<ConstitutionAmendment[]>([]);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string; body: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string }>>({});

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  }, []);

  const load = useCallback(() => run(async () => {
    if (!accessToken) throw new Error(es ? 'Inicia sesión como administrador.' : 'Administrator sign-in is required.');
    const [r, p, a, b] = await Promise.all([
      listConstitutionRules(accessToken), listConstitutionAmendments(accessToken, 'pending'),
      listConstitutionAmendments(accessToken, 'approved'), listConstitutionAmendments(accessToken, 'rejected')
    ]);
    setRules(r.rules); setPending(p.amendments); setDecided([...a.amendments, ...b.amendments].sort((x, y) => y.created_at.localeCompare(x.created_at)));
  }), [accessToken, es, run]);

  useEffect(() => { void load(); }, [load]);

  const studyNow = () => run(async () => {
    if (!accessToken) return;
    setMessage('');
    const result = await proposeConstitutionAmendments(accessToken);
    if (result.stats) setStats(result.stats);
    else setStats((await studyConstitutionLessons(accessToken)).stats);
    setMessage(result.created > 0
      ? (es ? `${result.created} propuesta(s) nueva(s) para tu revisión.` : `${result.created} new proposal(s) for your review.`)
      : (es ? 'No se encontraron errores repetidos nuevos.' : 'No new repeated mistakes found.'));
    const p = await listConstitutionAmendments(accessToken, 'pending'); setPending(p.amendments);
  });

  const decide = (a: ConstitutionAmendment, decision: 'approve' | 'reject') => run(async () => {
    if (!accessToken) return;
    const d = drafts[a.id];
    await decideConstitutionAmendment(accessToken, a.id, decision, decision === 'approve' && d ? { title: d.title, body: d.body } : {});
    await load();
  });

  const saveRule = () => run(async () => {
    if (!accessToken || !editing) return;
    await editConstitutionRule(accessToken, editing.id, { title: editing.title, body: editing.body });
    setEditing(null); await load();
  });

  const tabBtn = (id: Tab, label: string, count?: number) => (
    <button key={id} type="button" onClick={() => setTab(id)}
      className={`flex-1 min-h-[36px] rounded-lg text-[12px] font-extrabold ${tab === id ? 'bg-[var(--surface)] text-[var(--palm)] shadow-xs' : 'text-[var(--ink-soft)]'}`}>
      {label}{count ? ` (${count})` : ''}
    </button>
  );

  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-[var(--ink)]"><ScrollText className="h-4 w-4" />{es ? 'Constitución botánica' : 'Botanical constitution'}</h3>
        <p className="text-[12px] text-[var(--ink-soft)]">
          {es ? 'Las reglas que el Centro de Conocimiento siempre sigue. El sistema puede proponer mejoras al estudiar sus errores, pero solo tú las apruebas.'
              : 'The rules the Knowledge Center always follows. The system can propose improvements by studying its own mistakes, but only you approve them.'}
        </p>
      </div>
      <div className="flex gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        {tabBtn('rules', es ? 'Reglas' : 'Rules')}
        {tabBtn('lessons', es ? 'Lecciones' : 'Lessons', pending.length)}
        {tabBtn('history', es ? 'Historial' : 'History')}
      </div>
      {error && <p role="alert" className="text-[12px] font-semibold text-red-600">{error}</p>}
      {busy && <Loader2 className="h-4 w-4 animate-spin text-[var(--palm)]" />}

      {tab === 'rules' && rules.map((r) => (
        <article key={r.id} className={card}>
          <div className="flex items-start justify-between gap-2">
            <h4 className="min-w-0 break-words text-[13px] font-extrabold text-[var(--ink)]">{r.title}</h4>
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-[var(--ink-soft)]">
              {r.locked && <Lock className="h-3 w-3" />}{r.locked ? (es ? 'NÚCLEO' : 'CORE') : `v${r.version}`}
            </span>
          </div>
          {editing?.id === r.id ? (
            <>
              <input className={input} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <textarea className={input} rows={4} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={saveRule} className={`${btn} bg-[var(--palm)] text-white`}>{es ? 'Guardar' : 'Save'}</button>
                <button type="button" onClick={() => setEditing(null)} className={`${btn} border border-[var(--line)] text-[var(--ink)]`}>{es ? 'Cancelar' : 'Cancel'}</button>
              </div>
            </>
          ) : (
            <>
              <p className="break-words text-[12.5px] leading-relaxed text-[var(--ink)]">{r.body}</p>
              {!r.locked && (
                <button type="button" onClick={() => setEditing({ id: r.id, title: r.title, body: r.body })} className={`${btn} border border-[var(--palm)] text-[var(--palm)]`}>{es ? 'Editar' : 'Edit'}</button>
              )}
            </>
          )}
        </article>
      ))}

      {tab === 'lessons' && (
        <>
          <button type="button" disabled={busy} onClick={studyNow} className={`${btn} flex items-center justify-center gap-2 bg-[var(--palm)] text-white`}>
            <Sparkles className="h-4 w-4" />{es ? 'Estudiar errores ahora' : 'Study mistakes now'}
          </button>
          {message && <p className="text-[12px] font-bold text-[var(--palm)]">{message}</p>}
          {stats && (
            <p className="text-[11.5px] text-[var(--ink-soft)]">
              {es ? `Datos revisados: ${stats.extracted_facts} datos extraídos (${stats.facts_rejected_or_edited} rechazados o editados), ${stats.identification_submissions} identificaciones (${stats.identifications_doubted} cuestionadas).`
                  : `Studied: ${stats.extracted_facts} extracted facts (${stats.facts_rejected_or_edited} rejected or edited), ${stats.identification_submissions} identifications (${stats.identifications_doubted} questioned).`}
            </p>
          )}
          {!pending.length && <p className="text-[12px] text-[var(--ink-soft)]">{es ? 'No hay propuestas pendientes.' : 'No pending proposals.'}</p>}
          {pending.map((a) => {
            const d = drafts[a.id] || { title: a.proposed_title, body: a.proposed_body };
            return (
              <article key={a.id} className={card}>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--ink-soft)]">{es ? 'Enmienda propuesta' : 'Proposed amendment'}</p>
                <p className="break-words text-[12px] text-[var(--ink-soft)]">{a.rationale}</p>
                <input className={input} value={d.title} onChange={(e) => setDrafts({ ...drafts, [a.id]: { ...d, title: e.target.value } })} />
                <textarea className={input} rows={5} value={d.body} onChange={(e) => setDrafts({ ...drafts, [a.id]: { ...d, body: e.target.value } })} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => decide(a, 'approve')} className={`${btn} bg-[var(--palm)] text-white`}>{es ? 'Aprobar' : 'Approve'}</button>
                  <button type="button" disabled={busy} onClick={() => decide(a, 'reject')} className={`${btn} border border-[var(--line)] text-[var(--ink)]`}>{es ? 'Rechazar' : 'Reject'}</button>
                </div>
              </article>
            );
          })}
        </>
      )}

      {tab === 'history' && (
        decided.length ? decided.map((a) => (
          <article key={a.id} className={card}>
            <div className="flex items-start justify-between gap-2">
              <h4 className="min-w-0 break-words text-[13px] font-extrabold text-[var(--ink)]">{a.proposed_title}</h4>
              <span className={`shrink-0 text-[10px] font-extrabold ${a.status === 'approved' ? 'text-[var(--palm)]' : 'text-[var(--ink-soft)]'}`}>{a.status.toUpperCase()}</span>
            </div>
            <p className="text-[11px] text-[var(--ink-soft)]">{a.decided_by} · {a.decided_at ? new Date(a.decided_at).toLocaleDateString() : ''}</p>
          </article>
        )) : <p className="text-[12px] text-[var(--ink-soft)]">{es ? 'Aún no hay decisiones.' : 'No decisions yet.'}</p>
      )}
    </section>
  );
}
