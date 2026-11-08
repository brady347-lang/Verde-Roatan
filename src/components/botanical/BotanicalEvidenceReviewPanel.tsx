import React, { useCallback, useEffect, useState } from 'react';
import { Language } from '../../types';
import { BotanicalEvidenceQueueItem, listBotanicalEvidenceQueue, reviewBotanicalEvidence } from '../../services/api';

interface Props { lang: Language; accessToken?: string; }
const button = 'min-h-[38px] rounded-xl px-3 text-[11px] font-extrabold disabled:opacity-50';
const panel = 'rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3';
const pretty = (value: unknown) => {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

export const BotanicalEvidenceReviewPanel: React.FC<Props> = ({ lang, accessToken }) => {
  const es = lang === 'es';
  const [items, setItems] = useState<BotanicalEvidenceQueueItem[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    if (!accessToken) { setError(es ? 'Se requiere acceso de administrador.' : 'Administrator sign-in is required.'); return; }
    setBusy('load'); setError('');
    try { setItems(await listBotanicalEvidenceQueue(accessToken)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load evidence queue.'); }
    finally { setBusy(''); }
  }, [accessToken, es]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (item: BotanicalEvidenceQueueItem, decision: 'approve' | 'reject') => {
    if (!accessToken) return;
    setBusy(item.id); setError('');
    try {
      await reviewBotanicalEvidence(accessToken, item.id, decision, note[item.id] || '');
      setItems(current => current.filter(row => row.id !== item.id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save review decision.'); }
    finally { setBusy(''); }
  };

  return <div className="flex flex-col gap-3">
    <header className="flex items-start justify-between gap-2">
      <div>
        <h3 className="text-[15px] font-extrabold text-[var(--ink)]">{es ? 'Revisión de evidencia botánica' : 'Botanical Evidence Review'}</h3>
        <p className="text-[11px] text-[var(--ink-soft)]">{es ? 'Revisa evidencia de catálogo, identificaciones y correcciones. La aprobación administrativa permite recuperar la evidencia, pero no la declara científicamente verificada.' : 'Review catalog evidence, identifications and corrections. Admin approval makes evidence retrievable; it does not declare it scientifically verified.'}</p>
      </div>
      <button type="button" className={button + ' border border-[var(--line)] text-[var(--ink)]'} onClick={() => void load()} disabled={!!busy}>{es ? 'Actualizar' : 'Refresh'}</button>
    </header>
    {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-700">{error}</p>}
    <p className="text-[11px] text-[var(--ink-soft)]">{es ? 'Pendientes de decisión' : 'Awaiting decision'}: <b>{items.length}</b></p>
    {!items.length && !busy && <div className={panel}><p className="text-[12px] text-[var(--ink-soft)]">{es ? 'No hay evidencia pendiente de revisión.' : 'No evidence is awaiting review.'}</p></div>}
    {items.map(item => <article key={item.id} className={panel + ' flex flex-col gap-2'}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <b className="text-[13px] text-[var(--ink)]">{item.subject_key || item.evidence_type}</b>
          <p className="text-[10px] text-[var(--ink-soft)]">{item.evidence_type} · {item.source_system} · {new Date(item.created_at).toLocaleString()}</p>
        </div>
        <span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[9px] font-bold text-[var(--ink-soft)]">{item.approval_status}</span>
      </div>
      <p className="text-[10px] text-[var(--ink-soft)]">Evidence: {item.verification_status} · Processing: {item.status}</p>
      <details className="rounded-xl bg-[var(--surface-2)] p-2">
        <summary className="cursor-pointer text-[11px] font-bold text-[var(--ink)]">{es ? 'Ver evidencia y análisis de IA' : 'View submitted evidence and AI review'}</summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px] text-[var(--ink-soft)]">{pretty({ submitted: item.submitted_payload, model_review: item.model_result })}</pre>
      </details>
      <textarea className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--ink)]" rows={2} placeholder={es ? 'Nota de revisión (opcional)' : 'Review note (optional)'} value={note[item.id] || ''} onChange={e => setNote(v => ({ ...v, [item.id]: e.target.value }))} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={button + ' bg-[var(--palm)] text-white'} disabled={!!busy} onClick={() => void decide(item, 'approve')}>{busy === item.id ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Aprobar evidencia' : 'Approve evidence')}</button>
        <button type="button" className={button + ' border border-red-500/40 text-red-600'} disabled={!!busy} onClick={() => void decide(item, 'reject')}>{es ? 'Rechazar' : 'Reject'}</button>
      </div>
      <p className="text-[10px] text-[var(--ink-soft)]">{es ? 'La aprobación administrativa no cambia el nivel de verificación científica.' : 'Administrator approval does not change the scientific verification level.'}</p>
    </article>)}
  </div>;
};
