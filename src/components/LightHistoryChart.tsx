import React, { useMemo, useState } from 'react';
import type { LightReadingSample } from '../lib/lightHistoryStore';

type Props = { readings: LightReadingSample[]; lang: 'en' | 'es'; recording?: boolean };

const WINDOWS = [
  { id: '5m', ms: 5 * 60_000 },
  { id: '15m', ms: 15 * 60_000 },
  { id: '1h', ms: 60 * 60_000 },
  { id: 'all', ms: Number.POSITIVE_INFINITY }
] as const;

export const LightHistoryChart: React.FC<Props> = ({ readings, lang, recording = false }) => {
  const es = lang === 'es';
  const [windowId, setWindowId] = useState<(typeof WINDOWS)[number]['id']>('15m');
  const visible = useMemo(() => {
    const selected = WINDOWS.find(item => item.id === windowId) || WINDOWS[1];
    const cutoff = selected.ms === Number.POSITIVE_INFINITY ? 0 : Date.now() - selected.ms;
    return readings.filter(item => item.timestamp >= cutoff).slice(-360);
  }, [readings, windowId]);
  const values = visible.map(item => item.lux).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const chartW = 640;
  const chartH = 220;
  const left = 52;
  const right = 14;
  const top = 16;
  const bottom = 28;
  const innerW = chartW - left - right;
  const innerH = chartH - top - bottom;
  const dataRange = Math.max(100, max - min);
  const yMin = Math.max(0, min - dataRange * 0.12);
  const yMax = Math.max(yMin + 100, max + dataRange * 0.12);
  const firstTimestamp = visible[0]?.timestamp ?? 0;
  const timeSpan = Math.max(1, (visible[visible.length - 1]?.timestamp ?? firstTimestamp) - firstTimestamp);
  const coords = visible.map(sample => ({
    x: left + (visible.length <= 1 ? innerW / 2 : ((sample.timestamp - firstTimestamp) / timeSpan) * innerW),
    y: top + innerH - ((sample.lux - yMin) / (yMax - yMin)) * innerH
  }));
  const line = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = coords.length ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${(top + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(top + innerH).toFixed(1)} Z` : '';
  const latest = visible[visible.length - 1];
  const geoTaggedCount = visible.filter(sample => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude)).length;
  const sourceLabel = new Set(visible.map(sample => sample.method)).size > 1
    ? (es ? 'Sensor + cámara' : 'Sensor + camera')
    : latest?.method === 'camera_estimated' ? (es ? 'Cámara estimada' : 'Camera estimate')
      : latest ? (es ? 'Sensor ambiental' : 'Ambient sensor') : '';

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <b className="text-sm">{es ? 'Historial de luz en vivo' : 'Live light history'}</b>
          <p className="text-[10px] text-[var(--ink-soft)]">{es ? 'Lecturas guardadas localmente durante la sesión' : 'Readings saved locally during this session'}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${recording ? 'bg-emerald-100 text-emerald-800' : 'bg-[var(--surface-2)] text-[var(--ink-soft)]'}`}>
          {recording ? (es ? 'GRABANDO' : 'RECORDING') : (es ? 'PAUSADO' : 'PAUSED')}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--surface-2)] p-2"><span className="text-[9px] text-[var(--ink-soft)]">{es ? 'MÍNIMO' : 'LOW'}</span><b className="block text-sm tabular-nums">{values.length ? Math.round(min).toLocaleString() : '—'}</b></div>
        <div className="rounded-xl bg-[var(--surface-2)] p-2"><span className="text-[9px] text-[var(--ink-soft)]">{es ? 'PROMEDIO' : 'AVG'}</span><b className="block text-sm tabular-nums">{values.length ? Math.round(avg).toLocaleString() : '—'}</b></div>
        <div className="rounded-xl bg-[var(--surface-2)] p-2"><span className="text-[9px] text-[var(--ink-soft)]">{es ? 'MÁXIMO' : 'HIGH'}</span><b className="block text-sm tabular-nums">{values.length ? Math.round(max).toLocaleString() : '—'}</b></div>
      </div>
      <div className="mt-3 flex justify-end gap-1">
        {WINDOWS.map(item => <button key={item.id} type="button" onClick={() => setWindowId(item.id)} className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${windowId === item.id ? 'bg-[var(--palm)] text-white' : 'bg-[var(--surface-2)] text-[var(--ink-soft)]'}`}>{item.id.toUpperCase()}</button>)}
      </div>
      <div className="mt-1 overflow-hidden rounded-xl bg-[#071d17]">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} role="img" aria-label={es ? 'Gráfico histórico de lux' : 'Lux history chart'} className="h-52 w-full">
          <defs><linearGradient id="rootwise-lux-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#39d69b" stopOpacity=".35"/><stop offset="100%" stopColor="#39d69b" stopOpacity="0"/></linearGradient></defs>
          {[0, .25, .5, .75, 1].map((ratio, index) => {
            const y = top + ratio * innerH;
            const value = Math.round(yMax - ratio * (yMax - yMin));
            return <g key={index}><line x1={left} x2={chartW - right} y1={y} y2={y} stroke="#b9d8cc" strokeOpacity=".18" strokeDasharray="4 5"/><text x={left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#b9d8cc">{value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}</text></g>;
          })}
          {area && <path d={area} fill="url(#rootwise-lux-fill)"/>}
          {line && <path d={line} fill="none" stroke="#39d69b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
          {latest && coords.length > 0 && <g><circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="7" fill="#39d69b" fillOpacity=".22"/><circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3.5" fill="#d9fff0"/></g>}
          {!visible.length && <text x={chartW / 2} y={chartH / 2} textAnchor="middle" fontSize="13" fill="#b9d8cc">{es ? 'Inicia la medición para crear el gráfico' : 'Start measuring to build the chart'}</text>}
          <text x={left} y={chartH - 7} fontSize="10" fill="#b9d8cc">{visible[0] ? new Date(visible[0].timestamp).toLocaleTimeString(es ? 'es-HN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : ''}</text>
          <text x={chartW - right} y={chartH - 7} textAnchor="end" fontSize="10" fill="#b9d8cc">{latest ? new Date(latest.timestamp).toLocaleTimeString(es ? 'es-HN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : ''}</text>
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--ink-soft)]">
        <span>{visible.length} {es ? 'lecturas' : 'readings'} · {geoTaggedCount} GPS</span>
        <span>{sourceLabel} · {latest ? new Date(latest.timestamp).toLocaleTimeString(es ? 'es-HN' : 'en-US') : '—'}</span>
      </div>
    </section>
  );
};
