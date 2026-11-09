import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BotanicalHealthRecord,
  KnowledgeDocumentSummary,
  createBotanicalHealthRecord,
  createKnowledgeDocumentSummary,
  listBotanicalHealthRecords,
  listKnowledgeDocumentSummaries,
  listKnowledgeDocuments,
  reviewBotanicalHealthRecord,
  reviewKnowledgeDocumentSummary
} from '../../services/api';
import { Language } from '../../types';

interface Props {
  lang: Language;
  accessToken?: string;
}
type HealthStatus = 'pending' | 'approved' | 'rejected';
const fieldClass = 'w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--ink)]';
const buttonClass = 'min-h-[38px] rounded-xl px-3 text-[11px] font-extrabold disabled:opacity-50';
const lines = (value: string) => value.split('\n').map(v => v.trim()).filter(Boolean);

export const BotanicalKnowledgeCorePanel: React.FC<Props> = ({ lang, accessToken }) => {
  const es = lang === 'es';
  const [tab, setTab] = useState<'health' | 'summaries'>('health');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [docs, setDocs] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<KnowledgeDocumentSummary[]>([]);
  const [records, setRecords] = useState<BotanicalHealthRecord[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('pending');
  const [summaryForm, setSummaryForm] = useState({ document_id: '', summary: '', key_facts: '', critical_details: '', safety_warnings: '', source_pages: '' });
  const [recordForm, setRecordForm] = useState({ record_type: 'pest' as 'pest' | 'disease', common_name: '', scientific_name: '', symptoms: '', description: '', treatment: '', prevention: '', safety_warnings: '', source_references: '' });
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [visibility, setVisibility] = useState<Record<string, 'private' | 'public'>>({});
  const [verificationBasis, setVerificationBasis] = useState<Record<string, string>>({});
  const [sourceText, setSourceText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!accessToken) { setError(es ? 'Se requiere acceso de administrador.' : 'Administrator sign-in is required.'); return; }
    setBusy('loading'); setError('');
    try {
      const [d, s, h] = await Promise.all([
        listKnowledgeDocuments(accessToken),
        listKnowledgeDocumentSummaries(accessToken),
        listBotanicalHealthRecords(accessToken, healthStatus)
      ]);
      setDocs(d || []);
      setSummaries(s || []);
      setRecords(h || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Knowledge Core data.');
    } finally { setBusy(''); }
  }, [accessToken, es, healthStatus]);

  useEffect(() => { void load(); }, [load]);

  const docById = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs]);

  const saveSummary = async () => {
    if (!accessToken || !summaryForm.document_id) return;
    setBusy('summary-save'); setError(''); setNotice('');
    try {
      await createKnowledgeDocumentSummary(accessToken, {
        document_id: summaryForm.document_id,
        summary: summaryForm.summary,
        key_facts: lines(summaryForm.key_facts),
        critical_details: lines(summaryForm.critical_details),
        safety_warnings: lines(summaryForm.safety_warnings),
        source_pages: summaryForm.source_pages.split(/[ ,;]+/).map(Number).filter(n => Number.isInteger(n) && n > 0),
        generation_method: 'human'
      });
      setSummaryForm({ document_id: '', summary: '', key_facts: '', critical_details: '', safety_warnings: '', source_pages: '' });
      setNotice(es ? 'Resumen guardado como pendiente. Aún no se usa en respuestas.' : 'Summary saved as pending. It is not used in answers yet.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the summary.'); }
    finally { setBusy(''); }
  };

  const decideSummary = async (id: string, decision: 'approve' | 'reject') => {
    if (!accessToken) return;
    setBusy('summary-' + id); setError(''); setNotice('');
    try {
      await reviewKnowledgeDocumentSummary(accessToken, id, decision);
      setNotice(decision === 'approve'
        ? (es ? 'Resumen aprobado e indexado.' : 'Summary approved and indexed.')
        : (es ? 'Resumen rechazado.' : 'Summary rejected.'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not review summary.'); }
    finally { setBusy(''); }
  };

  const saveRecord = async () => {
    if (!accessToken || !recordForm.common_name.trim()) return;
    setBusy('record-create'); setError(''); setNotice('');
    try {
      await createBotanicalHealthRecord(accessToken, {
        ...recordForm,
        aliases: [],
        affected_plants: [],
        safety_warnings: lines(recordForm.safety_warnings),
        source_references: lines(recordForm.source_references).map(citation => ({ citation }))
      });
      setRecordForm({ record_type: 'pest', common_name: '', scientific_name: '', symptoms: '', description: '', treatment: '', prevention: '', safety_warnings: '', source_references: '' });
      setNotice(es ? 'Registro creado como pendiente; no está publicado ni indexado.' : 'Record created as pending; it is not published or indexed.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create health record.'); }
    finally { setBusy(''); }
  };

  const recordValues = (r: BotanicalHealthRecord) => edits[r.id] || {
    common_name: r.common_name || '',
    scientific_name: r.scientific_name || '',
    symptoms: r.symptoms || '',
    description: r.description || '',
    treatment: r.treatment || '',
    prevention: r.prevention || '',
    safety_warnings: (r.safety_warnings || []).join('\n')
  };

  const decideRecord = async (r: BotanicalHealthRecord, decision: 'approved' | 'rejected') => {
    if (!accessToken) return;
    const value = recordValues(r);
    const refs = lines(sourceText[r.id] ?? (r.source_references || []).map(x => String(x.citation || x.title || x.url || '')).filter(Boolean).join('\n'));
    const basis = verificationBasis[r.id] || '';
    // A free-text explanation is not proof of scientific verification.
    // Reserve that status for a separate evidence-based verification workflow.
    const verification_status = decision !== 'approved'
      ? 'community_submitted'
      : refs.length ? 'source_supported' : 'community_submitted';
    setBusy('record-' + r.id); setError(''); setNotice('');
    try {
      await reviewBotanicalHealthRecord(accessToken, {
        record_id: r.id,
        status: decision,
        visibility: visibility[r.id] || 'private',
        rag_indexed: decision === 'approved',
        verification_status,
        verification_basis: basis,
        source_references: refs.map(citation => ({ citation })),
        fields: {
          common_name: value.common_name,
          scientific_name: value.scientific_name,
          symptoms: value.symptoms,
          description: value.description,
          treatment: value.treatment,
          prevention: value.prevention,
          safety_warnings: lines(value.safety_warnings)
        }
      });
      setNotice(decision === 'approved'
        ? (es ? 'Registro aprobado e indexado.' : 'Record approved and indexed.')
        : (es ? 'Registro rechazado.' : 'Record rejected.'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not review health record.'); }
    finally { setBusy(''); }
  };

  const input = (label: string, value: string, onChange: (v: string) => void, rows = 2) => (
    <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--ink)]">
      {label}
      <textarea className={fieldClass} rows={rows} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-extrabold text-[var(--ink)]">Verde Knowledge Core</h3>
          <p className="text-[11px] text-[var(--ink-soft)]">
            {es ? 'Resúmenes revisados y registros de plagas/enfermedades. Nada entra en RAG antes de aprobarse.' : 'Reviewed summaries and pest/disease records. Nothing enters RAG before approval.'}
          </p>
        </div>
        <button type="button" className={buttonClass + ' border border-[var(--line)] text-[var(--ink)]'} onClick={() => void load()} disabled={!!busy}>
          {es ? 'Actualizar' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        <button type="button" onClick={() => setTab('health')} className={buttonClass + (tab === 'health' ? ' bg-[var(--palm)] text-white' : ' text-[var(--ink-soft)]')}>
          {es ? 'Plagas y enfermedades' : 'Pests & diseases'}
        </button>
        <button type="button" onClick={() => setTab('summaries')} className={buttonClass + (tab === 'summaries' ? ' bg-[var(--palm)] text-white' : ' text-[var(--ink-soft)]')}>
          {es ? 'Resúmenes de documentos' : 'Document summaries'}
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-[var(--palm)]/20 bg-[var(--palm)]/10 p-3 text-[12px] text-[var(--palm)]">{notice}</p>}

      {tab === 'summaries' && (
        <>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 flex flex-col gap-2">
            <b className="text-[13px] text-[var(--ink)]">{es ? 'Crear una versión de resumen' : 'Create a summary version'}</b>
            <p className="text-[11px] text-[var(--ink-soft)]">{es ? 'Primero aprueba e indexa el PDF en el Centro de Conocimiento existente. Conserva las páginas fuente para cada afirmación importante.' : 'First approve and index the PDF in the existing Knowledge Center. Keep source pages for important claims.'}</p>
            <select className={fieldClass} value={summaryForm.document_id} onChange={e => setSummaryForm(v => ({ ...v, document_id: e.target.value }))}>
              <option value="">{es ? 'Seleccionar documento aprobado' : 'Select approved document'}</option>
              {docs.filter(d => d.status === 'approved' && d.rag_indexed).map(d => <option key={d.id} value={d.id}>{d.original_name}</option>)}
            </select>
            {input(es ? 'Resumen' : 'Summary', summaryForm.summary, v => setSummaryForm(x => ({ ...x, summary: v })), 5)}
            {input(es ? 'Hechos clave (uno por línea)' : 'Key facts (one per line)', summaryForm.key_facts, v => setSummaryForm(x => ({ ...x, key_facts: v })))}
            {input(es ? 'Detalles críticos / aplicación (uno por línea)' : 'Critical details / application (one per line)', summaryForm.critical_details, v => setSummaryForm(x => ({ ...x, critical_details: v })))}
            {input(es ? 'Advertencias de seguridad (uno por línea)' : 'Safety warnings (one per line)', summaryForm.safety_warnings, v => setSummaryForm(x => ({ ...x, safety_warnings: v })))}
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--ink)]">
              {es ? 'Páginas fuente (ej. 2, 4, 7)' : 'Source pages (e.g. 2, 4, 7)'}
              <input className={fieldClass} value={summaryForm.source_pages} onChange={e => setSummaryForm(v => ({ ...v, source_pages: e.target.value }))} />
            </label>
            <button type="button" className={buttonClass + ' bg-[var(--palm)] text-white'} disabled={!!busy || !summaryForm.document_id || summaryForm.summary.trim().length < 40 || !summaryForm.source_pages.split(/[ ,;]+/).some(v => Number.isInteger(Number(v)) && Number(v) > 0)} onClick={() => void saveSummary()}>
              {busy === 'summary-save' ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar como pendiente' : 'Save as pending')}
            </button>
          </section>

          <section className="flex flex-col gap-2">
            <b className="text-[13px] text-[var(--ink)]">{es ? 'Historial de resúmenes' : 'Summary versions'}</b>
            {summaries.length === 0 && <p className="text-[12px] text-[var(--ink-soft)]">{es ? 'Todavía no hay resúmenes.' : 'No summaries yet.'}</p>}
            {summaries.map(summary => {
              const doc = docById.get(summary.document_id);
              const canApprove = doc?.status === 'approved' && doc?.rag_indexed === true;
              return <article key={summary.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-[12px] text-[var(--ink)]">{doc?.original_name || 'Source document'} · v{summary.version}</b>
                  <span className="text-[10px] font-extrabold uppercase text-[var(--ink-soft)]">{summary.review_status}</span>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--ink-soft)] whitespace-pre-wrap">{summary.summary}</p>
                {[
                  { key: 'key_facts', title: es ? 'Hechos clave' : 'Key facts', values: summary.key_facts },
                  { key: 'critical_details', title: es ? 'Detalles críticos y limitaciones' : 'Critical details & limitations', values: summary.critical_details },
                  { key: 'safety_warnings', title: es ? 'Advertencias de seguridad' : 'Safety warnings', values: summary.safety_warnings }
                ].map(section => {
                  const values = Array.isArray(section.values) ? section.values : [];
                  return <section key={section.key} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2">
                    <b className="text-[11px] text-[var(--ink)]">{section.title} ({values.length})</b>
                    {values.length ? <ul className="mt-1 list-disc pl-4 space-y-1 text-[11px] leading-relaxed text-[var(--ink-soft)]">
                      {values.map((item: any, index: number) => {
                        const value = typeof item === 'string' ? item
                          : typeof item?.text === 'string' ? item.text
                          : typeof item?.value === 'string' ? item.value
                          : JSON.stringify(item);
                        return <li key={section.key + '-' + index}>{value}</li>;
                      })}
                    </ul> : <p className="mt-1 text-[10px] text-[var(--ink-soft)]">{es ? 'No se proporcionó contenido.' : 'No content supplied.'}</p>}
                  </section>;
                })}
                <p className="text-[10px] text-[var(--ink-soft)]">{es ? 'Páginas fuente' : 'Source pages'}: {(summary.source_pages || []).join(', ') || '—'} · {summary.generation_method}</p>
                {summary.review_status === 'pending' && <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={buttonClass + ' bg-[var(--palm)] text-white'} disabled={!!busy || !canApprove} onClick={() => void decideSummary(summary.id, 'approve')}>{es ? 'Aprobar e indexar' : 'Approve & index'}</button>
                  <button type="button" className={buttonClass + ' border border-red-500/40 text-red-600'} disabled={!!busy} onClick={() => void decideSummary(summary.id, 'reject')}>{es ? 'Rechazar' : 'Reject'}</button>
                </div>}
                {!canApprove && summary.review_status === 'pending' && <p className="text-[10px] text-amber-700">{es ? 'El documento fuente debe estar aprobado e indexado primero.' : 'The source document must be approved and indexed first.'}</p>}
              </article>;
            })}
          </section>
        </>
      )}

      {tab === 'health' && (
        <>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 flex flex-col gap-2">
            <b className="text-[13px] text-[var(--ink)]">{es ? 'Agregar registro de plaga o enfermedad' : 'Add a pest or disease record'}</b>
            <div className="grid grid-cols-2 gap-2">
              <select className={fieldClass} value={recordForm.record_type} onChange={e => setRecordForm(v => ({ ...v, record_type: e.target.value as 'pest' | 'disease' }))}>
                <option value="pest">{es ? 'Plaga' : 'Pest'}</option><option value="disease">{es ? 'Enfermedad' : 'Disease'}</option>
              </select>
              <input className={fieldClass} placeholder={es ? 'Nombre común' : 'Common name'} value={recordForm.common_name} onChange={e => setRecordForm(v => ({ ...v, common_name: e.target.value }))} />
            </div>
            <input className={fieldClass} placeholder={es ? 'Nombre científico (opcional)' : 'Scientific name (optional)'} value={recordForm.scientific_name} onChange={e => setRecordForm(v => ({ ...v, scientific_name: e.target.value }))} />
            {input(es ? 'Síntomas' : 'Symptoms', recordForm.symptoms, v => setRecordForm(x => ({ ...x, symptoms: v })))}
            {input(es ? 'Descripción / identificación' : 'Description / identification', recordForm.description, v => setRecordForm(x => ({ ...x, description: v })))}
            {input(es ? 'Tratamiento (con fuente)' : 'Treatment (with source)', recordForm.treatment, v => setRecordForm(x => ({ ...x, treatment: v })))}
            {input(es ? 'Prevención' : 'Prevention', recordForm.prevention, v => setRecordForm(x => ({ ...x, prevention: v })))}
            {input(es ? 'Advertencias de seguridad' : 'Safety warnings', recordForm.safety_warnings, v => setRecordForm(x => ({ ...x, safety_warnings: v })))}
            {input(es ? 'Referencias (una por línea)' : 'References (one per line)', recordForm.source_references, v => setRecordForm(x => ({ ...x, source_references: v })))}
            <button type="button" className={buttonClass + ' bg-[var(--palm)] text-white'} disabled={!!busy || recordForm.common_name.trim().length < 2} onClick={() => void saveRecord()}>{es ? 'Crear pendiente' : 'Create pending record'}</button>
          </section>

          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
            {(['pending', 'approved', 'rejected'] as HealthStatus[]).map(status => <button key={status} type="button" className={buttonClass + (healthStatus === status ? ' bg-[var(--surface)] text-[var(--palm)]' : ' text-[var(--ink-soft)]')} onClick={() => setHealthStatus(status)}>{status}</button>)}
          </div>
          {records.length === 0 && <p className="text-[12px] text-[var(--ink-soft)]">{es ? 'No hay registros en esta lista.' : 'No records in this list.'}</p>}
          {records.map(record => {
            const value = recordValues(record);
            const refs = sourceText[record.id] ?? (record.source_references || []).map(x => String(x.citation || x.title || x.url || '')).filter(Boolean).join('\n');
            const basis = verificationBasis[record.id] || '';
            return <article key={record.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 flex flex-col gap-2">
              {record.evidence_image_url && <img src={record.evidence_image_url} alt="Submitted specimen evidence" className="max-h-52 w-full rounded-xl object-cover" />}
              <div className="flex items-center justify-between gap-2">
                <div><b className="text-[13px] text-[var(--ink)]">{record.common_name}</b><p className="text-[10px] uppercase text-[var(--ink-soft)]">{record.record_type} · {record.verification_status}</p></div>
                <span className="text-[10px] font-bold text-[var(--ink-soft)]">{record.review_status}</span>
              </div>
              {record.evidence?.ai_identification && (
                <div className="rounded-xl bg-[var(--surface-2)] p-2 text-[10px] text-[var(--ink-soft)]">
                  <b>AI evidence only — unverified:</b> {record.evidence.ai_identification.primary_diagnosis || record.common_name}
                  {record.evidence.ai_identification.likely_cause && <p>Possible cause: {record.evidence.ai_identification.likely_cause}</p>}
                  {!!record.evidence.ai_identification.suggested_treatment?.length && <p>Suggested treatment: {record.evidence.ai_identification.suggested_treatment.join('; ')}</p>}
                  {!!record.evidence.ai_identification.suggested_prevention?.length && <p>Suggested prevention: {record.evidence.ai_identification.suggested_prevention.join('; ')}</p>}
                </div>
              )}
              {input(es ? 'Nombre común' : 'Common name', value.common_name, v => setEdits(old => ({ ...old, [record.id]: { ...value, common_name: v } })), 1)}
              {input(es ? 'Nombre científico' : 'Scientific name', value.scientific_name, v => setEdits(old => ({ ...old, [record.id]: { ...value, scientific_name: v } })), 1)}
              {input(es ? 'Síntomas' : 'Symptoms', value.symptoms, v => setEdits(old => ({ ...old, [record.id]: { ...value, symptoms: v } })))}
              {input(es ? 'Descripción' : 'Description', value.description, v => setEdits(old => ({ ...old, [record.id]: { ...value, description: v } })))}
              {input(es ? 'Tratamiento' : 'Treatment', value.treatment, v => setEdits(old => ({ ...old, [record.id]: { ...value, treatment: v } })))}
              {input(es ? 'Prevención' : 'Prevention', value.prevention, v => setEdits(old => ({ ...old, [record.id]: { ...value, prevention: v } })))}
              {input(es ? 'Advertencias de seguridad' : 'Safety warnings', value.safety_warnings, v => setEdits(old => ({ ...old, [record.id]: { ...value, safety_warnings: v } })))}
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--ink)]">{es ? 'Referencias' : 'Source references'}
                <textarea className={fieldClass} rows={2} value={refs} onChange={e => setSourceText(old => ({ ...old, [record.id]: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--ink)]">{es ? 'Notas de revisión (opcionales; no demuestran por sí solas verificación científica)' : 'Review notes (optional; do not by themselves establish scientific verification)'}
                <textarea className={fieldClass} rows={2} value={verificationBasis[record.id] || ''} onChange={e => setVerificationBasis(old => ({ ...old, [record.id]: e.target.value }))} />
              </label>
              <select className={fieldClass} value={visibility[record.id] || record.visibility || 'private'} onChange={e => setVisibility(old => ({ ...old, [record.id]: e.target.value as 'private' | 'public' }))}>
                <option value="private">{es ? 'Privado' : 'Private'}</option><option value="public">{es ? 'Público' : 'Public'}</option>
              </select>
              {record.review_status !== 'rejected' && <div className="grid grid-cols-2 gap-2">
                <button type="button" className={buttonClass + ' bg-[var(--palm)] text-white'} disabled={!!busy || value.common_name.trim().length < 2} onClick={() => void decideRecord(record, 'approved')}>{es ? 'Aprobar e indexar' : 'Approve & index'}</button>
                <button type="button" className={buttonClass + ' border border-red-500/40 text-red-600'} disabled={!!busy} onClick={() => void decideRecord(record, 'rejected')}>{es ? 'Rechazar' : 'Reject'}</button>
              </div>}
            </article>;
          })}
        </>
      )}
    </div>
  );
};
