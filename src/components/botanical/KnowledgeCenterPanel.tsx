import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, FileText, Loader2, RefreshCw, Search, Upload } from 'lucide-react';
import {
  KnowledgeDocument, KnowledgeEntity, KnowledgeSource, askKnowledge, extractKnowledgeEntities, getKnowledgeDocument,
  ingestKnowledgePages, listKnowledgeDocuments, markKnowledgeFailed, promoteKnowledgeDocument, retryKnowledgeDocument, reviewKnowledgeDocument, uploadKnowledgePdf, BotanicalReferenceImage, listBotanicalReferenceImages, uploadBotanicalReferenceImage, reviewBotanicalReferenceImage, searchBotanicalTaxa
} from '../../services/api';
import { extractPdfPages } from '../../lib/pdfText';
import { Language } from '../../types';

interface Props { lang: Language; accessToken?: string }

const inputCls = 'w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[13px]';
const btnCls = 'px-3.5 py-2.5 rounded-xl bg-[var(--palm)] text-white text-[13px] font-bold disabled:opacity-50 active:scale-95 transition-all';
const ghostCls = 'px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-[var(--ink)] text-[13px] font-bold disabled:opacity-50';

const STATUS_STYLE: Record<string, string> = {
  uploaded: 'bg-slate-100 text-slate-800', processing: 'bg-sky-100 text-sky-800', awaiting_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-slate-200 text-slate-700', failed: 'bg-red-100 text-red-800'
};
const STATUS_LABEL: Record<string, [string, string]> = {
  uploaded: ['Uploaded', 'Subido'], processing: ['Processing', 'Procesando'], awaiting_review: ['Awaiting review', 'Por revisar'],
  approved: ['Approved', 'Aprobado'], rejected: ['Rejected', 'Rechazado'], failed: ['Failed', 'Falló']
};
const CATEGORY_LABEL: Record<string, string> = { taxonomy: 'Taxonomy', identification: 'Identification', horticulture: 'Horticulture', regional: 'Regional', health: 'Health', source: 'Sources' };

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MB';
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

export const KnowledgeCenterPanel: React.FC<Props> = ({ lang, accessToken }) => {
  const es = lang === 'es';
  const [tab, setTab] = useState<'documents' | 'playground' | 'reference_photos'>('documents');
  const [docs, setDocs] = useState<KnowledgeDocument[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) { setError(es ? 'Inicia sesión como administrador.' : 'Administrator sign-in is required.'); return; }
    try { setDocs(await listKnowledgeDocuments(accessToken)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load documents.'); setDocs([]); }
  }, [accessToken, es]);
  useEffect(() => { load(); }, [load]);

  // Reads the PDF's text in the browser, sends it for indexing, then asks for fact extraction.
  const process = async (docId: string, bytes: ArrayBuffer) => {
    if (!accessToken) return;
    try {
      await extractPdfPages(
        bytes,
        async (pages, done, total) => { await ingestKnowledgePages(accessToken, docId, pages, done, total); },
        (p) => setBusy((es ? 'Leyendo y indexando página ' : 'Reading and indexing page ') + p.page + '/' + p.total)
      );
      setBusy(es ? 'Extrayendo datos botánicos…' : 'Extracting botanical facts…');
      const r = await extractKnowledgeEntities(accessToken, docId);
      setNotice(r.warning || (es ? `Listo para revisión: ${r.entities} datos propuestos.` : `Ready for review: ${r.entities} facts proposed.`));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Processing failed.';
      try { await markKnowledgeFailed(accessToken, docId, msg); } catch { /* the original error is what matters */ }
      setError((es ? 'El procesamiento falló: ' : 'Processing failed: ') + msg);
    }
  };

  const onFile = async (file: File) => {
    if (!accessToken) return;
    setError(''); setNotice('');
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { setError(es ? 'Elige un archivo PDF.' : 'Please choose a PDF file.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError(es ? 'El PDF supera 20 MB.' : 'The PDF is larger than 20 MB.'); return; }
    try {
      setBusy(es ? 'Subiendo PDF…' : 'Uploading PDF…');
      const up = await uploadKnowledgePdf(accessToken, file);
      if (up.duplicate) { setNotice((es ? 'Este PDF ya existe: ' : 'This PDF already exists: ') + up.document.original_name); await load(); return; }
      await load();
      await process(up.document.id, await file.arrayBuffer());
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; await load(); }
  };

  const retry = async (d: KnowledgeDocument) => {
    if (!accessToken) return;
    setError(''); setNotice('');
    try {
      setBusy(es ? 'Descargando el PDF original…' : 'Fetching the original PDF…');
      const r = await retryKnowledgeDocument(accessToken, d.id);
      if (!r.pdf_url) throw new Error(es ? 'No se pudo abrir el PDF original.' : 'The original PDF could not be opened.');
      const res = await fetch(r.pdf_url);
      if (!res.ok) throw new Error(es ? 'No se pudo descargar el PDF original.' : 'The original PDF could not be downloaded.');
      await process(d.id, await res.arrayBuffer());
    } catch (e) { setError(e instanceof Error ? e.message : 'Retry failed.'); }
    finally { setBusy(''); await load(); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <b className="text-[15px] text-[var(--ink)] font-extrabold flex items-center gap-1.5"><BookOpen className="w-4 h-4" />{es ? 'Centro de Conocimiento Botánico' : 'Botanical Knowledge Center'}</b>
        <small className="block text-[11.5px] text-[var(--ink-soft)]">
          {es ? 'Documentos científicos reales: solo los documentos aprobados se usan en las respuestas.' : 'Real scientific documents. Only approved documents are used to answer questions.'}
        </small>
      </div>
      <div className="flex gap-1.5">
        {(['documents', 'reference_photos', 'playground'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold border ${tab === t ? 'bg-[var(--palm)] text-white border-[var(--palm)]' : 'border-[var(--line)] text-[var(--ink-soft)]'}`}>
            {t === 'documents' ? (es ? 'Documentos' : 'Documents') : t === 'reference_photos' ? (es ? 'Fotos de referencia' : 'Reference photos') : 'RAG Playground'}
          </button>
        ))}
      </div>

      {busy && <div className="flex items-center gap-2 text-[12.5px] text-[var(--ink-soft)]"><Loader2 className="w-4 h-4 animate-spin" />{busy}</div>}
      {error && <p role="alert" className="text-[12.5px] font-semibold text-red-600">{error}</p>}
      {notice && <p className="text-[12.5px] text-[var(--ink-soft)]">{notice}</p>}

      {tab === 'documents' && (
        <>
          <div className="flex gap-2 flex-wrap items-center">
            <label className={`${btnCls} inline-flex items-center gap-1.5 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className="w-4 h-4" />{es ? 'Subir PDF' : 'Upload PDF'}
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <button type="button" className={ghostCls} onClick={load} disabled={!!busy}><RefreshCw className="w-3.5 h-3.5 inline mr-1" />{es ? 'Actualizar' : 'Refresh'}</button>
          </div>
          {docs === null && <div className="flex items-center gap-2 text-[12.5px] text-[var(--ink-soft)]"><Loader2 className="w-4 h-4 animate-spin" />…</div>}
          {docs && docs.length === 0 && !error && (
            <p className="text-[13px] text-[var(--ink-soft)] bg-[var(--surface-2)] rounded-2xl p-4 text-center">{es ? 'Aún no hay documentos. Sube un PDF científico.' : 'No documents yet. Upload a scientific PDF.'}</p>
          )}
          <div className="flex flex-col gap-2">
            {docs?.map((d) => (
              <DocumentCard key={d.id} d={d} es={es} open={openId === d.id} accessToken={accessToken}
                onToggle={() => setOpenId(openId === d.id ? null : d.id)} onRetry={() => retry(d)} onChanged={load} busy={!!busy} />
            ))}
          </div>
        </>
      )}
      {tab === 'reference_photos' && <ReferencePhotos es={es} accessToken={accessToken} />}
      {tab === 'playground' && <Playground es={es} accessToken={accessToken} />}
    </div>
  );
};

const DocumentCard: React.FC<{ d: KnowledgeDocument; es: boolean; open: boolean; accessToken?: string; busy: boolean; onToggle: () => void; onRetry: () => void; onChanged: () => void }> = ({ d, es, open, accessToken, busy, onToggle, onRetry, onChanged }) => {
  const canRetry = d.status === 'failed' || d.status === 'uploaded' || d.status === 'processing' || d.status === 'rejected';
  return (
    <div className="border border-[var(--line)] rounded-2xl bg-[var(--surface)]">
      <button type="button" onClick={onToggle} className="w-full flex items-start gap-2 p-3 text-left">
        <FileText className="w-5 h-5 shrink-0 mt-0.5 text-[var(--palm)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-[var(--ink)] truncate">{d.original_name}</div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${STATUS_STYLE[d.status] || ''}`}>{STATUS_LABEL[d.status]?.[es ? 1 : 0] || d.status}</span>
            <small className="text-[11px] text-[var(--ink-soft)]">{mb(d.file_size_bytes)}{d.page_count ? ` · ${d.page_count} ${es ? 'págs.' : 'pages'}` : ''} · {d.chunks_count} {es ? 'fragmentos' : 'chunks'}{d.rag_indexed ? ` · RAG ${d.visibility}` : ''}</small>
          </div>
          {d.error_message && <div className={`text-[11.5px] mt-1 ${d.status === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>{d.error_message}</div>}
          <small className="text-[11px] text-[var(--ink-soft)]">{when(d.created_at)}</small>
        </div>
        {open ? <ChevronUp className="w-4 h-4 mt-1" /> : <ChevronDown className="w-4 h-4 mt-1" />}
      </button>
      {canRetry && (
        <div className="px-3 pb-3"><button type="button" className={ghostCls} disabled={busy} onClick={onRetry}><RefreshCw className="w-3.5 h-3.5 inline mr-1" />{es ? 'Reintentar procesamiento' : 'Retry processing'}</button></div>
      )}
      {open && <ReviewPane d={d} es={es} accessToken={accessToken} onChanged={onChanged} />}
    </div>
  );
};

const ReviewPane: React.FC<{ d: KnowledgeDocument; es: boolean; accessToken?: string; onChanged: () => void }> = ({ d, es, accessToken, onChanged }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof getKnowledgeDocument>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [promoted, setPromoted] = useState('');
  const [decisions, setDecisions] = useState<Record<string, { status: string; value?: string }>>({});
  const [visibility, setVisibility] = useState<'private' | 'public'>(d.visibility);
  const [citation, setCitation] = useState(d.citation || '');
  const [institution, setInstitution] = useState(d.source_institution || '');
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    let live = true;
    if (!accessToken) return;
    getKnowledgeDocument(accessToken, d.id).then((r) => { if (live) setData(r); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not open the document.'); });
    return () => { live = false; };
  }, [accessToken, d.id, d.status]);

  const decide = (e: KnowledgeEntity, status: string, value?: string) => setDecisions((p) => ({ ...p, [e.id]: { status, value } }));
  const eff = (e: KnowledgeEntity) => decisions[e.id]?.status || e.approval_status;

  const submit = async (action: 'approve' | 'reject') => {
    if (!accessToken) return;
    setBusy(true); setError('');
    try {
      await reviewKnowledgeDocument(accessToken, {
        document_id: d.id, action, visibility, citation, source_institution: institution,
        entity_decisions: Object.entries(decisions).map(([id, v]) => ({ id, status: v.status, ...(v.status === 'modified' && v.value ? { edited_value: { value: v.value } } : {}) }))
      });
      onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'The review could not be saved.'); }
    finally { setBusy(false); }
  };

  if (error && !data) return <p role="alert" className="px-3 pb-3 text-[12.5px] font-semibold text-red-600">{error}</p>;
  if (!data) return <div className="px-3 pb-3 flex items-center gap-2 text-[12.5px] text-[var(--ink-soft)]"><Loader2 className="w-4 h-4 animate-spin" />…</div>;
  const reviewable = d.status === 'awaiting_review';
  const grouped = data.entities.reduce<Record<string, KnowledgeEntity[]>>((acc, e) => { (acc[e.category] ||= []).push(e); return acc; }, {});

  return (
    <div className="border-t border-[var(--line)] p-3 flex flex-col gap-3">
      {data.pdf_url
        ? <a href={data.pdf_url} target="_blank" rel="noopener noreferrer" className={`${ghostCls} inline-flex items-center gap-1.5 self-start`}><ExternalLink className="w-3.5 h-3.5" />{es ? 'Abrir PDF original' : 'Open original PDF'}</a>
        : <small className="text-[12px] text-amber-700">{es ? 'No se pudo generar el enlace del PDF original.' : 'The original PDF link could not be created.'}</small>}

      <div>
        <button type="button" className="text-[12.5px] font-bold text-[var(--palm)]" onClick={() => setShowText(!showText)}>{showText ? (es ? 'Ocultar texto extraído' : 'Hide extracted text') : (es ? 'Ver texto extraído' : 'View extracted text')} ({data.chunks.length}{data.chunks.length >= 80 ? '+' : ''})</button>
        {showText && (
          <div className="mt-1.5 max-h-72 overflow-y-auto flex flex-col gap-1.5">
            {data.chunks.map((c) => (
              <div key={c.chunk_index} className="text-[12px] text-[var(--ink)] bg-[var(--surface-2)] rounded-lg p-2"><small className="text-[var(--ink-soft)]">{es ? 'Pág.' : 'Page'} {c.page_number ?? '?'}</small><div className="whitespace-pre-wrap">{c.content}</div></div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]">{es ? 'Datos botánicos extraídos' : 'Extracted botanical facts'}</span>
        {data.entities.length === 0 && <small className="text-[12px] text-[var(--ink-soft)]">{es ? 'No se extrajeron datos automáticamente. El texto indexado aún puede aprobarse.' : 'No facts were extracted automatically. The indexed text can still be approved.'}</small>}
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="flex flex-col gap-1.5">
            <b className="text-[12px] text-[var(--ink)]">{CATEGORY_LABEL[cat] || cat}</b>
            {list.map((e) => {
              const st = eff(e);
              const val = decisions[e.id]?.value ?? e.edited_value?.value ?? e.extracted_value.value ?? '';
              return (
                <div key={e.id} className="border border-[var(--line)] rounded-xl p-2 flex flex-col gap-1">
                  <div className="text-[12px] text-[var(--ink-soft)]"><i>{e.scientific_name || '—'}</i> · {e.field_name} · {Math.round(e.confidence * 100)}%{e.source_page ? ` · ${es ? 'pág.' : 'p.'} ${e.source_page}` : ''}</div>
                  {reviewable ? <input className={inputCls} value={val} onChange={(ev) => decide(e, 'modified', ev.target.value)} /> : <div className="text-[13px] text-[var(--ink)]">{val}</div>}
                  {e.source_snippet && <q className="text-[11.5px] text-[var(--ink-soft)]">{e.source_snippet}</q>}
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${st === 'approved' ? 'bg-emerald-100 text-emerald-800' : st === 'rejected' ? 'bg-red-100 text-red-800' : st === 'modified' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>{st}</span>
                    {reviewable && <>
                      <button type="button" className="text-[12px] font-bold text-emerald-700 px-2" onClick={() => decide(e, 'approved')}>{es ? 'Aprobar' : 'Approve'}</button>
                      <button type="button" className="text-[12px] font-bold text-red-700 px-2" onClick={() => decide(e, 'rejected')}>{es ? 'Rechazar' : 'Reject'}</button>
                    </>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {reviewable && (
        <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3">
          <label className="flex flex-col gap-0.5"><span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]">{es ? 'Cita / fuente' : 'Citation / source'}</span><input className={inputCls} value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="Author, year, title" /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]">{es ? 'Institución' : 'Institution'}</span><input className={inputCls} value={institution} onChange={(e) => setInstitution(e.target.value)} /></label>
          <label className="flex flex-col gap-0.5"><span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]">{es ? 'Visibilidad' : 'Visibility'}</span>
            <select className={inputCls} value={visibility} onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}>
              <option value="private">{es ? 'Privado (solo administradores)' : 'Private (administrators only)'}</option>
              <option value="public">{es ? 'Público (el consultor público puede citarlo)' : 'Public (the public consultant may cite it)'}</option>
            </select></label>
          {error && <p role="alert" className="text-[12.5px] font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className={btnCls} disabled={busy} onClick={() => submit('approve')}><CheckCircle2 className="w-4 h-4 inline mr-1" />{es ? 'Aprobar e indexar en RAG' : 'Approve & index in RAG'}</button>
            <button type="button" className={ghostCls} disabled={busy} onClick={() => submit('reject')}>{es ? 'Rechazar' : 'Reject'}</button>
          </div>
        </div>
      )}
      {d.status === 'approved' && (
        <div className="flex gap-2 items-center">
          <small className="text-[12px] text-emerald-700">{es ? 'Aprobado' : 'Approved'} {when(d.reviewed_at)}</small>
          <button type="button" className={ghostCls} disabled={busy} onClick={() => submit('reject')}>{es ? 'Retirar de RAG' : 'Withdraw from RAG'}</button>
          <button type="button" className={ghostCls} disabled={busy} onClick={async () => {
            if (!accessToken) return;
            setBusy(true); setError(''); setPromoted('');
            try {
              const r = await promoteKnowledgeDocument(accessToken, d.id);
              setPromoted(r.created > 0
                ? (es ? `${r.created} borradores creados (sin verificar). Revísalos en Botánica.` : `${r.created} draft records created (unverified).`)
                : (es ? 'No se crearon borradores (ya existen o no hay plantas con nombre).' : 'No drafts created (already exist or no named plants).'));
            } catch (e) { setError(e instanceof Error ? e.message : 'Could not create drafts.'); }
            finally { setBusy(false); }
          }}>{es ? 'Crear borradores botánicos' : 'Create draft botanical records'}</button>
        </div>
      )}
      {d.status === 'approved' && promoted && (
        <small className="text-[12px] text-emerald-700">{promoted}</small>
      )}
    </div>
  );
};

const ReferencePhotos: React.FC<{ es: boolean; accessToken?: string }> = ({ es, accessToken }) => {
  const [items, setItems] = useState<BotanicalReferenceImage[]>([]);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [q, setQ] = useState('');
  const [taxa, setTaxa] = useState<Array<{ id: string; scientific_name: string; common_name?: string }>>([]);
  const [taxon, setTaxon] = useState<{ id: string; scientific_name: string; common_name?: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageType, setImageType] = useState('mature_specimen');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [attribution, setAttribution] = useState('');
  const [license, setLicense] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    try { setItems(await listBotanicalReferenceImages(accessToken, status)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load reference photos.'); }
  }, [accessToken, status]);
  useEffect(() => { load(); }, [load]);

  const findTaxa = async () => {
    if (!accessToken || q.trim().length < 2) return;
    setBusy(true); setError('');
    try { setTaxa(await searchBotanicalTaxa(accessToken, q.trim())); }
    catch (e) { setError(e instanceof Error ? e.message : 'Plant search failed.'); }
    finally { setBusy(false); }
  };

  const upload = async () => {
    if (!accessToken || !file || !taxon) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await uploadBotanicalReferenceImage(accessToken, file, {
        taxon_id: taxon.id, image_type: imageType, source_name: sourceName,
        source_url: sourceUrl, attribution, license
      });
      setNotice(es ? 'Foto subida. Quedó privada y pendiente de revisión.' : 'Photo uploaded. It is private and awaiting review.');
      setFile(null); setSourceName(''); setSourceUrl(''); setAttribution(''); setLicense('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setBusy(false); }
  };

  const review = async (id: string, action: 'approve' | 'reject') => {
    if (!accessToken) return;
    setBusy(true); setError('');
    try {
      await reviewBotanicalReferenceImage(accessToken, id, action, action === 'approve' ? visibility : 'private');
      setNotice(action === 'approve' ? (es ? 'Foto aprobada.' : 'Photo approved.') : (es ? 'Foto rechazada.' : 'Photo rejected.'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Review failed.'); }
    finally { setBusy(false); }
  };

  return <div className="flex flex-col gap-3">
    <div className="rounded-xl border border-[var(--line)] p-3 flex flex-col gap-2">
      <b className="text-[13px]">{es ? 'Agregar foto botánica de referencia' : 'Add a botanical reference photo'}</b>
      <p className="text-[11.5px] text-[var(--ink-soft)]">{es ? 'Las fotos nuevas son privadas y pendientes. Solo las aprobadas como públicas pueden aparecer en identificaciones.' : 'New photos are private and pending. Only photos approved as public can appear in identification results.'}</p>
      <div className="flex gap-2">
        <input className={inputCls} value={q} onChange={e => { setQ(e.target.value); setTaxa([]); setTaxon(null); }} placeholder={es ? 'Buscar nombre científico o común' : 'Search scientific or common name'} />
        <button type="button" className={ghostCls} disabled={busy || q.trim().length < 2} onClick={findTaxa}><Search className="w-4 h-4" /></button>
      </div>
      {taxa.map(t => <button key={t.id} type="button" onClick={() => { setTaxon(t); setTaxa([]); }} className={`text-left rounded-lg border p-2 text-[12px] ${taxon?.id === t.id ? 'border-[var(--palm)]' : 'border-[var(--line)]'}`}><b>{t.scientific_name}</b><span className="block text-[var(--ink-soft)]">{t.common_name || ''}</span></button>)}
      {taxon && <div className="text-[12px] text-emerald-700">{es ? 'Planta seleccionada:' : 'Selected plant:'} <b>{taxon.scientific_name}</b> · {taxon.common_name || ''}</div>}
      <label className="text-[11px] font-semibold">{es ? 'Tipo de imagen' : 'Image type'}
        <select className={inputCls} value={imageType} onChange={e => setImageType(e.target.value)}>
          {['mature_specimen','foliage_detail','flower','fruit','bark','habitat','seedling','other'].map(v => <option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}
        </select>
      </label>
      <input className={inputCls} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} />
      <input className={inputCls} value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder={es ? 'Nombre de la fuente' : 'Source name'} />
      <input className={inputCls} value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https:// source URL" />
      <input className={inputCls} value={attribution} onChange={e => setAttribution(e.target.value)} placeholder={es ? 'Atribución / autor' : 'Attribution / author'} />
      <input className={inputCls} value={license} onChange={e => setLicense(e.target.value)} placeholder={es ? 'Licencia (ej. CC BY 4.0)' : 'License (e.g. CC BY 4.0)'} />
      <button type="button" className={btnCls} disabled={busy || !file || !taxon} onClick={upload}><Upload className="w-4 h-4 inline mr-1" />{es ? 'Subir foto privada' : 'Upload private photo'}</button>
    </div>
    <div className="flex gap-2 items-center">
      <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
        <option value="pending">{es ? 'Pendientes' : 'Pending'}</option><option value="approved">{es ? 'Aprobadas' : 'Approved'}</option><option value="rejected">{es ? 'Rechazadas' : 'Rejected'}</option>
      </select>
      <button type="button" className={ghostCls} onClick={load} disabled={busy}><RefreshCw className="w-4 h-4" /></button>
    </div>
    {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
    {notice && <p className="text-[12px] text-[var(--ink-soft)]">{notice}</p>}
    {items.length === 0 && <p className="text-[12px] text-[var(--ink-soft)] text-center p-3">{es ? 'No hay fotos en este estado.' : 'No photos in this status.'}</p>}
    {items.map(item => <div key={item.id} className="border border-[var(--line)] rounded-xl p-2.5 flex flex-col gap-2">
      {item.preview_url && <img src={item.preview_url} alt={item.image_type} className="w-full max-h-56 object-contain rounded-lg bg-[var(--surface-2)]" />}
      <div className="text-[12px]"><b>{item.image_type.replaceAll('_',' ')}</b> · {item.source_name || (es ? 'Sin fuente' : 'No source')}<div className="text-[var(--ink-soft)] break-all">{item.taxon_id}</div>
        {item.attribution && <div className="text-[var(--ink-soft)]">{item.attribution}</div>}
        {item.license && <div className="text-[var(--ink-soft)]">{item.license}</div>}
        {item.source_url && <a className="text-[var(--palm)] underline" href={item.source_url} target="_blank" rel="noopener noreferrer">{es ? 'Abrir fuente' : 'Open source'}</a>}
        <div className="text-[11px] mt-1">{item.review_status} · {item.visibility}</div>
      </div>
      {status === 'pending' && <div className="flex flex-wrap gap-2">
        <select className={inputCls} value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}><option value="private">{es ? 'Aprobar como privado' : 'Approve as private'}</option><option value="public">{es ? 'Aprobar como público' : 'Approve as public'}</option></select>
        <button type="button" className={btnCls} disabled={busy} onClick={() => review(item.id,'approve')}>{es ? 'Aprobar' : 'Approve'}</button>
        <button type="button" className={ghostCls} disabled={busy} onClick={() => review(item.id,'reject')}>{es ? 'Rechazar' : 'Reject'}</button>
      </div>}
    </div>)}
  </div>;
};

const Playground: React.FC<{ es: boolean; accessToken?: string }> = ({ es, accessToken }) => {
  const [q, setQ] = useState('');
  const [minSim, setMinSim] = useState(0.35);
  const [includePrivate, setIncludePrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<{ answered: boolean; answer: string; sources: KnowledgeSource[] } | null>(null);

  const ask = async () => {
    if (!accessToken || q.trim().length < 3) return;
    setBusy(true); setError(''); setRes(null);
    try { setRes(await askKnowledge(accessToken, q.trim(), { includePrivate, minSimilarity: minSim })); }
    catch (e) { setError(e instanceof Error ? e.message : 'The question failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <textarea className={inputCls} rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder={es ? 'Pregunta a los documentos aprobados…' : 'Ask the approved documents…'} />
      <label className="text-[12px] text-[var(--ink)] flex items-center gap-2"><input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} />{es ? 'Incluir documentos privados (desmarca para simular el consultor público)' : 'Include private documents (untick to simulate the public consultant)'}</label>
      <label className="text-[12px] text-[var(--ink)] flex items-center gap-2">{es ? 'Similitud mínima' : 'Minimum similarity'}: {minSim.toFixed(2)}<input type="range" min={0.2} max={0.8} step={0.05} value={minSim} onChange={(e) => setMinSim(Number(e.target.value))} /></label>
      <button type="button" className={btnCls} disabled={busy || q.trim().length < 3 || !accessToken} onClick={ask}>{busy ? <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> : <Search className="w-4 h-4 inline mr-1" />}{es ? 'Preguntar' : 'Ask'}</button>
      {error && <p role="alert" className="text-[12.5px] font-semibold text-red-600">{error}</p>}
      {res && (
        <div className="flex flex-col gap-2">
          <div className={`rounded-2xl p-3 text-[13.5px] ${res.answered ? 'bg-emerald-50 text-[var(--ink)]' : 'bg-amber-50 text-amber-900'}`}>
            {!res.answered && <AlertTriangle className="w-4 h-4 inline mr-1" />}{res.answer}
          </div>
          {res.sources.map((s) => (
            <div key={s.n} className={`border rounded-xl p-2.5 text-[12px] ${s.used ? 'border-emerald-300' : 'border-[var(--line)]'}`}>
              <b>[{s.n}] {s.document}</b> · {es ? 'pág.' : 'page'} {s.page ?? '?'} · {es ? 'similitud' : 'similarity'} {s.similarity}{s.citation ? ` · ${s.citation}` : ''}
              <div className="text-[var(--ink-soft)] mt-1">{s.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
