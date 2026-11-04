import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, Loader2, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import {
  BotanicalField, ColumnMapping, FIELD_LABELS, ExistingRecord, ImportRow, RowInput,
  cellToString, isForbiddenHeader, mappingFromAi, parseCsv, recomputeRows, rowInputsFromRows,
  suggestMapping, summarize, toCommitPayload, buildRows
} from '../../lib/botanicalImport';
import {
  BotanicalImportResult, TaxonomyCheck, commitBotanicalImport, fetchExistingBotanicalRecords,
  suggestImportColumnMapping, validateBotanicalNames
} from '../../services/api';
import { CatalogItem, Language } from '../../types';

interface Props {
  lang: Language;
  accessToken?: string;
  catalog: CatalogItem[];
}

const FIELDS = Object.keys(FIELD_LABELS) as BotanicalField[];
const inputCls = 'w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[13px]';
const btnCls = 'px-3.5 py-2.5 rounded-xl bg-[var(--palm)] text-white text-[13px] font-bold disabled:opacity-50 active:scale-95 transition-all';
const ghostCls = 'px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-[var(--ink)] text-[13px] font-bold disabled:opacity-50';

const STATUS_STYLE: Record<ImportRow['status'], string> = {
  ready: 'bg-emerald-100 text-emerald-800',
  needs_review: 'bg-amber-100 text-amber-800',
  blocked: 'bg-red-100 text-red-800'
};

export const BotanicalImportPanel: React.FC<Props> = ({ lang, accessToken, catalog }) => {
  const es = lang === 'es';
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'choose' | 'map' | 'preview' | 'done'>('choose');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [inputs, setInputs] = useState<RowInput[]>([]);
  const [existing, setExisting] = useState<ExistingRecord[]>([]);
  const [checks, setChecks] = useState<Record<string, TaxonomyCheck>>({});
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<BotanicalImportResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  const rows = useMemo(() => recomputeRows(inputs, existing), [inputs, existing]);
  const stats = useMemo(() => summarize(rows), [rows]);

  const reset = () => {
    setStep('choose'); setTable([]); setMapping(null); setInputs([]); setChecks({}); setError(''); setNotice('');
    setResult(null); setConfirming(false); setOpenRow(null); setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const readFile = async (file: File) => {
    setError(''); setNotice('');
    const lower = file.name.toLowerCase();
    if (file.size > 8 * 1024 * 1024) { setError(es ? 'El archivo supera 8 MB.' : 'The file is larger than 8 MB.'); return; }
    setBusy(es ? 'Leyendo archivo…' : 'Reading file…');
    try {
      let t: string[][];
      if (lower.endsWith('.xlsx')) {
        const { default: readXlsxFile } = await import('read-excel-file');
        const raw = (await readXlsxFile(file)) as unknown[][];
        t = raw.map((r) => r.map(cellToString)).filter((r) => r.some((c) => c.trim() !== ''));
      } else if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv')) {
        t = parseCsv(await file.text());
      } else if (lower.endsWith('.xls')) {
        throw new Error(es ? 'El formato .xls antiguo no es compatible. Guarda el archivo como .xlsx o .csv e inténtalo de nuevo.' : 'The old .xls format is not supported. Save the file as .xlsx or .csv and try again.');
      } else {
        throw new Error(es ? 'Usa un archivo .csv o .xlsx.' : 'Please choose a .csv or .xlsx file.');
      }
      if (t.length < 2) throw new Error(es ? 'El archivo no tiene filas de datos.' : 'The file has no data rows (a header row plus at least one plant).');
      if (t.length > 2001) throw new Error(es ? 'Máximo 2000 filas por archivo.' : 'At most 2,000 rows per file.');
      setFileName(file.name);
      setTable(t);
      setMapping(suggestMapping(t[0]));
      setStep('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be read.');
    } finally {
      setBusy('');
    }
  };

  const aiMap = async () => {
    if (!accessToken || !mapping) return;
    setBusy(es ? 'Consultando IA…' : 'Asking AI…'); setError(''); setNotice('');
    try {
      const ai = await suggestImportColumnMapping(accessToken, table[0], table.slice(1, 6));
      setMapping(mappingFromAi(table[0], ai));
      setNotice(es ? 'Sugerencia de IA aplicada. Revísala antes de continuar.' : 'AI suggestion applied. Review it before continuing.');
    } catch (e) {
      setError((e instanceof Error ? e.message : 'AI mapping failed.') + (es ? ' Se mantiene la asignación automática.' : ' The automatic mapping is kept.'));
    } finally { setBusy(''); }
  };

  const buildPreview = async () => {
    if (!mapping) return;
    setError(''); setNotice('');
    const mapped = Object.values(mapping.map);
    if (!mapped.includes('scientific_name') && !(mapped.includes('genus') && mapped.includes('species'))) {
      setError(es ? 'Asigna una columna al nombre científico (o a género y especie).' : 'Map a column to Scientific name (or to both Genus and Species).'); return;
    }
    if (!mapped.includes('common_name')) { setError(es ? 'Asigna una columna al nombre común.' : 'Map a column to Common name.'); return; }
    setBusy(es ? 'Buscando duplicados…' : 'Checking for duplicates…');
    const fromCatalog: ExistingRecord[] = catalog.filter((c) => c.sci).map((c) => ({ scientific_name: c.sci, common_name: c.name, source: 'catalog' }));
    let fromDb: ExistingRecord[] = [];
    try {
      if (accessToken) fromDb = (await fetchExistingBotanicalRecords(accessToken)).map((r) => ({ ...r, source: 'botanical' as const }));
    } catch (e) {
      setNotice((e instanceof Error ? e.message : '') + (es ? ' Solo se comparó con el catálogo de plantas.' : ' Duplicates were checked against the plant catalog only.'));
    }
    const ex = [...fromCatalog, ...fromDb];
    setExisting(ex);
    setInputs(rowInputsFromRows(buildRows(table, mapping, ex)));
    setStep('preview'); setBusy('');
  };

  const edit = (rowNumber: number, field: BotanicalField, value: string) =>
    setInputs((prev) => prev.map((i) => (i.rowNumber === rowNumber ? { ...i, values: { ...i.values, [field]: value }, approved: false } : i)));
  const setApproved = (rowNumber: number, approved: boolean) =>
    setInputs((prev) => prev.map((i) => (i.rowNumber === rowNumber ? { ...i, approved } : i)));
  const approveAllReady = () =>
    setInputs((prev) => prev.map((i) => { const r = rows.find((x) => x.rowNumber === i.rowNumber); return r && r.status === 'ready' ? { ...i, approved: true } : i; }));
  const approveAllImportable = () =>
    setInputs((prev) => prev.map((i) => { const r = rows.find((x) => x.rowNumber === i.rowNumber); return r && r.status !== 'blocked' ? { ...i, approved: true } : i; }));

  const checkTaxonomy = async () => {
    if (!accessToken) return;
    const names = [...new Set(rows.filter((r) => r.status !== 'blocked').map((r) => r.values.scientific_name!).filter(Boolean))];
    if (!names.length) return;
    setBusy(es ? 'Validando taxonomía…' : 'Validating taxonomy…'); setError('');
    try {
      const next: Record<string, TaxonomyCheck> = {};
      for (let i = 0; i < names.length; i += 40) {
        for (const c of await validateBotanicalNames(accessToken, names.slice(i, i + 40))) next[c.name] = c;
      }
      setChecks(next);
      const unavailable = Object.values(next).filter((c) => c.match === 'UNAVAILABLE').length;
      setNotice(unavailable ? (es ? `${unavailable} nombres no se pudieron validar ahora.` : `${unavailable} names could not be checked right now.`) : (es ? 'Taxonomía validada con GBIF.' : 'Taxonomy checked against GBIF.'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Taxonomy check failed.'); }
    finally { setBusy(''); }
  };

  const taxonomyNote = (name?: string): { text: string; warn: boolean } | null => {
    const c = name ? checks[name] : undefined;
    if (!c) return null;
    if (c.match === 'UNAVAILABLE') return { text: es ? 'No se pudo validar' : 'Could not be checked', warn: true };
    if (c.match === 'NONE' || c.match === 'HIGHERRANK') return { text: es ? 'No encontrado en GBIF: revisa la ortografía' : 'Not found in GBIF: check the spelling', warn: true };
    if (c.kingdom && c.kingdom !== 'Plantae') return { text: es ? `GBIF lo clasifica como ${c.kingdom}, no como planta` : `GBIF classifies this as ${c.kingdom}, not a plant`, warn: true };
    if (c.status === 'SYNONYM') return { text: es ? `Sinónimo; nombre aceptado: ${c.canonical}` : `Synonym; accepted name: ${c.canonical}`, warn: true };
    if (c.match === 'FUZZY') return { text: es ? `Coincidencia aproximada: ${c.canonical}` : `Approximate match: ${c.canonical}`, warn: true };
    return { text: es ? `Validado en GBIF${c.family ? ' · ' + c.family : ''}` : `Verified in GBIF${c.family ? ' · ' + c.family : ''}`, warn: false };
  };

  const commit = async () => {
    if (!accessToken) return;
    setBusy(es ? 'Importando…' : 'Importing…'); setError(''); setConfirming(false);
    try {
      const payload = toCommitPayload(rows).map((r) => {
        const c = checks[r.scientific_name];
        return c ? { ...r, taxonomy_check: { match: c.match, status: c.status ?? null, canonical: c.canonical ?? null } } : r;
      });
      const res = await commitBotanicalImport(accessToken, fileName, payload);
      setResult(res); setStep('done');
    } catch (e) { setError(e instanceof Error ? e.message : 'The import failed. Nothing was overwritten.'); }
    finally { setBusy(''); }
  };

  const ignoredCols = mapping?.ignored ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <b className="text-[15px] text-[var(--ink)] font-extrabold flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" />{es ? 'Importación botánica masiva' : 'Bulk botanical import'}</b>
        <small className="block text-[11.5px] text-[var(--ink-soft)]">
          {es ? 'CSV o Excel (.xlsx). Nunca se importan precios, existencias ni proveedores, y nunca se sobrescribe un registro existente.'
              : 'CSV or Excel (.xlsx). Prices, stock and suppliers are never imported, and an existing record is never overwritten.'}
        </small>
      </div>

      {busy && <div className="flex items-center gap-2 text-[12.5px] text-[var(--ink-soft)]"><Loader2 className="w-4 h-4 animate-spin" />{busy}</div>}
      {error && <p role="alert" className="text-[12.5px] font-semibold text-red-600">{error}</p>}
      {notice && <p className="text-[12.5px] text-[var(--ink-soft)]">{notice}</p>}

      {step === 'choose' && (
        <div className="border-2 border-dashed border-[var(--line)] rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
          <Upload className="w-6 h-6 text-[var(--palm)]" />
          <p className="text-[13px] text-[var(--ink)]">{es ? 'Elige un archivo con una fila de encabezados y una planta por fila.' : 'Choose a file with a header row and one plant per row.'}</p>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="text-[12.5px] max-w-full" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </div>
      )}

      {step === 'map' && mapping && (
        <div className="flex flex-col gap-3">
          <div className="text-[12.5px] text-[var(--ink-soft)]">{fileName} · {table.length - 1} {es ? 'filas' : 'rows'}</div>
          {ignoredCols.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[12px] text-amber-900 flex gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <b>{es ? 'Columnas ignoradas a propósito:' : 'Columns deliberately ignored:'}</b>
                <ul className="mt-0.5">{ignoredCols.map((c) => <li key={c.column}>“{c.column}” — {c.reason}</li>)}</ul>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {table[0].map((h, i) => {
              const locked = isForbiddenHeader(h);
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2/5 min-w-0">
                    <div className="text-[12.5px] font-bold text-[var(--ink)] truncate">{h || `(${es ? 'sin título' : 'untitled'} ${i + 1})`}</div>
                    <small className="block text-[11px] text-[var(--ink-soft)] truncate">{table[1]?.[i]}</small>
                  </div>
                  <select className={inputCls} disabled={!!locked} value={locked ? '' : (mapping.map[i] ?? '')}
                    onChange={(e) => setMapping({ ...mapping, map: { ...mapping.map, [i]: (e.target.value || null) as BotanicalField | null } })}>
                    <option value="">{locked ? (es ? 'No se importa' : 'Never imported') : (es ? '— No importar —' : '— Do not import —')}</option>
                    {FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={btnCls} disabled={!!busy} onClick={buildPreview}>{es ? 'Crear vista previa' : 'Build preview'}</button>
            <button type="button" className={ghostCls} disabled={!!busy || !accessToken} onClick={aiMap}><Sparkles className="w-3.5 h-3.5 inline mr-1" />{es ? 'Sugerir con IA' : 'Suggest with AI'}</button>
            <button type="button" className={ghostCls} onClick={reset}>{es ? 'Cancelar' : 'Cancel'}</button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5 text-[11.5px] font-bold">
            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">{stats.ready} {es ? 'listas' : 'ready'}</span>
            <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800">{stats.needsReview} {es ? 'por revisar' : 'to review'}</span>
            <span className="px-2 py-1 rounded-full bg-red-100 text-red-800">{stats.blocked} {es ? 'bloqueadas' : 'blocked'}</span>
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-800">{stats.duplicates} {es ? 'duplicadas' : 'duplicates'}</span>
            <span className="px-2 py-1 rounded-full bg-[var(--palm)] text-white">{stats.approved} {es ? 'aprobadas' : 'approved'}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={ghostCls} disabled={!!busy || !accessToken} onClick={checkTaxonomy}>{es ? 'Validar taxonomía (GBIF)' : 'Validate taxonomy (GBIF)'}</button>
            <button type="button" className={ghostCls} onClick={approveAllReady}>{es ? 'Aprobar listas' : 'Approve ready'}</button>
            <button type="button" className={ghostCls} onClick={approveAllImportable}>{es ? 'Aprobar todas las importables' : 'Approve all importable'}</button>
            <button type="button" className={ghostCls} onClick={() => setStep('map')}>{es ? 'Volver a columnas' : 'Back to columns'}</button>
          </div>

          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const open = openRow === r.rowNumber;
              const tax = taxonomyNote(r.values.scientific_name);
              return (
                <div key={r.rowNumber} className="border border-[var(--line)] rounded-2xl bg-[var(--surface)]">
                  <div className="flex items-start gap-2 p-3">
                    <input type="checkbox" className="mt-1.5 w-5 h-5" disabled={r.status === 'blocked'} checked={r.approved}
                      onChange={(e) => setApproved(r.rowNumber, e.target.checked)} aria-label="Approve row" />
                    <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setOpenRow(open ? null : r.rowNumber)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <i className="text-[13.5px] font-bold text-[var(--ink)]">{r.values.scientific_name || '—'}</i>
                        <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status]}`}>{r.status === 'ready' ? (es ? 'Lista' : 'Ready') : r.status === 'blocked' ? (es ? 'Bloqueada' : 'Blocked') : (es ? 'Revisar' : 'Review')}</span>
                      </div>
                      <div className="text-[12.5px] text-[var(--ink)] truncate">{r.values.common_name || '—'}{r.values.family ? ` · ${r.values.family}` : ''}</div>
                      <small className="text-[11px] text-[var(--ink-soft)]">{es ? 'Fila' : 'Row'} {r.rowNumber}</small>
                      {tax && <div className={`text-[11.5px] font-semibold ${tax.warn ? 'text-amber-700' : 'text-emerald-700'}`}>{tax.warn ? <AlertTriangle className="w-3 h-3 inline mr-1" /> : <CheckCircle2 className="w-3 h-3 inline mr-1" />}{tax.text}</div>}
                    </button>
                    {open ? <ChevronUp className="w-4 h-4 mt-1.5" /> : <ChevronDown className="w-4 h-4 mt-1.5" />}
                  </div>
                  {r.issues.length > 0 && (
                    <ul className="px-3 pb-2 text-[11.5px] flex flex-col gap-0.5">
                      {r.issues.filter((i) => i.severity !== 'info' || open).map((i, k) => (
                        <li key={k} className={i.severity === 'error' ? 'text-red-700' : i.severity === 'warning' ? 'text-amber-700' : 'text-[var(--ink-soft)]'}>• {i.message}</li>
                      ))}
                    </ul>
                  )}
                  {open && (
                    <div className="border-t border-[var(--line)] p-3 grid gap-2">
                      {FIELDS.map((f) => (
                        <label key={f} className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]">{FIELD_LABELS[f]}</span>
                          {['description', 'habitat', 'distribution', 'pests_diseases', 'references', 'propagation', 'toxicity', 'climate'].includes(f)
                            ? <textarea className={inputCls} rows={2} value={r.values[f] || ''} onChange={(e) => edit(r.rowNumber, f, e.target.value)} />
                            : <input className={inputCls} value={r.values[f] || ''} onChange={(e) => edit(r.rowNumber, f, e.target.value)} />}
                        </label>
                      ))}
                      <small className="text-[11px] text-[var(--ink-soft)]">{es ? 'Editar una fila quita su aprobación.' : 'Editing a row removes its approval.'}</small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-2 bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-2 shadow-md">
            {!confirming ? (
              <button type="button" className={btnCls} disabled={!!busy || stats.approved === 0 || !accessToken} onClick={() => setConfirming(true)}>
                {es ? `Importar ${stats.approved} registros aprobados` : `Import ${stats.approved} approved records`}
              </button>
            ) : (
              <>
                <p className="text-[12.5px] text-[var(--ink)]">
                  {es ? `Se crearán hasta ${stats.approved} registros botánicos nuevos. Los registros existentes no se modifican. ¿Confirmas?`
                      : `This creates up to ${stats.approved} new botanical records. Existing records are not changed. Confirm?`}
                </p>
                <div className="flex gap-2">
                  <button type="button" className={btnCls} disabled={!!busy} onClick={commit}>{es ? 'Sí, importar' : 'Yes, import'}</button>
                  <button type="button" className={ghostCls} onClick={() => setConfirming(false)}>{es ? 'Cancelar' : 'Cancel'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-bold text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />
            {es ? `${result.inserted} registros creados, ${result.skipped} omitidos.` : `${result.inserted} records created, ${result.skipped} skipped.`}
          </p>
          {result.rejected.length > 0 && (
            <ul className="text-[12px] text-[var(--ink-soft)] list-disc pl-5">{result.rejected.slice(0, 30).map((r, i) => <li key={i}><i>{r.name}</i> — {r.reason}</li>)}</ul>
          )}
          <small className="text-[11.5px] text-[var(--ink-soft)]">{es ? 'Los registros importados quedan como «no verificados científicamente».' : 'Imported records are marked "not scientifically verified".'}</small>
          <button type="button" className={btnCls} onClick={reset}>{es ? 'Importar otro archivo' : 'Import another file'}</button>
        </div>
      )}
    </div>
  );
};
