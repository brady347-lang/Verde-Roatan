import React, { useEffect, useMemo, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { AlertCircle, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { BotanicalDocument } from '../../types/botanicalKnowledge';
import { getBotanicalSourceFile } from '../../services/botanicalSourceFileStorage';

interface Props { document: BotanicalDocument; }

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

export const BotanicalSourcePreview: React.FC<Props> = ({ document }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [plainText, setPlainText] = useState('');

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setLoading(true); setError(''); setRows([]); setBlob(null); setFileUrl(null);
    (async () => {
      try {
        const source = await getBotanicalSourceFile(document.id);
        if (!active) return;
        if (!source) { setError('The original file is not stored on this device. Older sample entries only contain extracted summaries. Upload the original PDF or spreadsheet again to preview it here.'); return; }
        setBlob(source);
        url = URL.createObjectURL(source);
        setFileUrl(url);
        if (document.file_type === 'txt') {
          const text = await source.text();
          if (active) setPlainText(text);
        } else if (document.file_type === 'csv') {
          const text = await source.text();
          if (active) setRows(parseCsv(text));
        } else if (document.file_type === 'xlsx') {
          const parsed = await readXlsxFile(source);
          if (active) { setRows(parsed as unknown[][]); setSheetName('First worksheet'); }
        } else if (document.file_type === 'xls') {
          setError('Legacy .xls preview is not supported yet. Please save the workbook as .xlsx or .csv and upload it again.');
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to read this source file.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [document.id, document.file_type]);

  const downloadUrl = fileUrl;
  const isTable = document.file_type === 'csv' || document.file_type === 'xlsx';
  const displayRows = useMemo(() => rows.slice(0, 501), [rows]);

  if (loading) return <div className="p-8 flex items-center justify-center gap-2 text-sm text-[var(--ink-soft)]"><Loader2 className="w-5 h-5 animate-spin"/> Loading original document…</div>;

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <b className="text-sm text-[var(--ink)]">Original source file</b>
          <p className="text-xs text-[var(--ink-soft)] break-all">{document.original_name}</p>
        </div>
        {downloadUrl && <a href={downloadUrl} download={document.original_name} className="shrink-0 px-3 py-2 rounded-xl bg-[var(--palm)] text-white text-xs font-bold flex items-center gap-2"><Download className="w-4 h-4"/> Download original</a>}
      </div>
      {error && <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-[var(--ink)] flex gap-2"><AlertCircle className="w-5 h-5 shrink-0 text-amber-600"/><span>{error}</span></div>}
      {!error && document.file_type === 'pdf' && fileUrl && <iframe title={document.original_name} src={fileUrl} className="w-full h-[65dvh] min-h-[420px] rounded-xl border border-[var(--line)] bg-white"/>}
      {!error && isTable && displayRows.length > 0 && (
        <div className="rounded-xl border border-[var(--line)] overflow-auto max-h-[65dvh] bg-[var(--surface)]">
          {sheetName && <div className="px-3 py-2 text-xs font-bold text-[var(--ink-soft)] border-b border-[var(--line)]">{sheetName}</div>}
          <table className="min-w-full text-xs border-collapse">
            <tbody>{displayRows.map((row, ri) => <tr key={ri} className={ri === 0 ? 'bg-[var(--surface-2)] font-bold sticky top-0' : 'border-t border-[var(--line)]'}>{(row || []).map((cell, ci) => <td key={ci} className="px-3 py-2 border-r border-[var(--line)] align-top whitespace-pre-wrap min-w-[110px]">{cell === null || cell === undefined ? '' : String(cell)}</td>)}</tr>)}</tbody>
          </table>
          {rows.length > 500 && <p className="p-2 text-center text-xs text-[var(--ink-soft)]">Showing first 500 rows for mobile performance.</p>}
        </div>
      )}
      {!error && document.file_type === 'txt' && blob && <pre className="p-3 rounded-xl bg-[var(--surface-2)] text-xs whitespace-pre-wrap break-words max-h-[65dvh] overflow-auto">{plainText}</pre>}
      {!error && !isTable && document.file_type !== 'pdf' && document.file_type !== 'txt' && fileUrl && <div className="p-4 text-sm text-[var(--ink-soft)]">This file can be downloaded for review. Inline preview for this format is not available yet.</div>}
    </div>
  );
};
