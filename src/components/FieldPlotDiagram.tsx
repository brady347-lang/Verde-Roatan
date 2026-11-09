import React, { useState } from 'react';
import { distanceMeters, type TrackPoint } from '../services/gpsTracking';

type Props = { points: TrackPoint[]; lang: 'en' | 'es'; areaM2: number; perimeterM: number };

export const FieldPlotDiagram: React.FC<Props> = ({ points, lang, areaM2, perimeterM }) => {
  const es = lang === 'es';
  const [detailZoom, setDetailZoom] = useState(2);
  if (!points.length) return null;

  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const origin = points[0];
  const xy = points.map(point => ({
    x: distanceMeters({ lat: meanLat, lon: origin.lon }, { lat: meanLat, lon: point.lon }) * Math.sign(point.lon - origin.lon || 1),
    y: distanceMeters({ lat: origin.lat, lon: origin.lon }, { lat: point.lat, lon: origin.lon }) * Math.sign(point.lat - origin.lat || 1)
  }));
  const minX = Math.min(...xy.map(point => point.x));
  const maxX = Math.max(...xy.map(point => point.x));
  const minY = Math.min(...xy.map(point => point.y));
  const maxY = Math.max(...xy.map(point => point.y));
  const spanX = Math.max(2, maxX - minX);
  const spanY = Math.max(2, maxY - minY);
  const pad = 28;
  const width = 360;
  const height = 240;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const projected = xy.map(point => ({
    x: offsetX + (point.x - minX) * scale,
    y: height - offsetY - (point.y - minY) * scale
  }));
  const path = projected.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const closedPath = points.length >= 3 ? `${path} Z` : path;
  const latest = projected[projected.length - 1];
  const detailTransform = latest
    ? `translate(${width / 2} ${height / 2}) scale(${detailZoom}) translate(${-latest.x} ${-latest.y})`
    : undefined;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <b className="text-xs">{es ? 'Diagrama del terreno' : 'Field plot diagram'}</b>
        <span className="text-[10px] text-[var(--ink-soft)]">{points.length} {es ? 'puntos' : 'points'}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-[var(--ink-soft)]">{es ? 'Vista general' : 'Full plot overview'}</span>
        <span className="text-[9px] text-[var(--ink-soft)]">{es ? 'Todo el recorrido' : 'Entire recorded boundary'}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={es ? 'Vista general del perímetro GPS' : 'Full GPS boundary overview'} className="mt-1 h-56 w-full rounded-xl bg-[#f2f8f4]">
        <defs><pattern id="rootwise-field-grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="#247b55" strokeOpacity=".16" strokeWidth="1"/></pattern></defs>
        <rect width={width} height={height} fill="url(#rootwise-field-grid)"/>
        {points.length >= 3 && <path d={closedPath} fill="#39a879" fillOpacity=".25" stroke="#16845b" strokeWidth="3" strokeLinejoin="round"/>}
        {points.length === 2 && <path d={path} fill="none" stroke="#16845b" strokeWidth="4" strokeLinecap="round"/>}
        {projected.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="6" fill="#126b4b" stroke="#fff" strokeWidth="2"/><text x={point.x + 9} y={point.y - 8} fontSize="10" fill="#14543c">{index + 1}</text></g>)}
        {latest && <circle cx={latest.x} cy={latest.y} r="10" fill="none" stroke="#0b8f62" strokeWidth="2" strokeDasharray="3 3"/>}
        {points.length >= 3 && <text x={width / 2} y={height - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#14543c">{areaM2.toFixed(1)} m²</text>}
      </svg>

      <div className="mt-3 rounded-xl border border-[var(--line)] p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <b className="text-xs">{es ? 'Zoom de precisión' : 'Precision close-up'}</b>
            <p className="text-[9px] text-[var(--ink-soft)]">{es ? 'Ampliado alrededor del último punto GPS' : 'Magnified around your latest GPS point'}</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={es ? 'Alejar diagrama' : 'Zoom out diagram'} onClick={() => setDetailZoom(value => Math.max(1, value - 1))} disabled={detailZoom === 1} className="h-8 w-8 rounded-lg border border-[var(--line)] text-sm disabled:opacity-40">−</button>
            <span className="min-w-10 text-center text-[10px] font-semibold">{detailZoom}×</span>
            <button type="button" aria-label={es ? 'Acercar diagrama' : 'Zoom in diagram'} onClick={() => setDetailZoom(value => Math.min(5, value + 1))} disabled={detailZoom === 5} className="h-8 w-8 rounded-lg border border-[var(--line)] text-sm disabled:opacity-40">+</button>
            <button type="button" onClick={() => setDetailZoom(2)} className="h-8 rounded-lg border border-[var(--line)] px-2 text-[10px]">{es ? 'Restablecer' : 'Reset'}</button>
          </div>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={es ? 'Vista ampliada para revisar los puntos GPS cercanos' : 'Magnified GPS detail view for checking nearby points'} className="mt-2 h-56 w-full rounded-xl bg-[#f2f8f4]">
          <defs>
            <pattern id="rootwise-field-detail-grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="#247b55" strokeOpacity=".2" strokeWidth="1"/></pattern>
            <clipPath id="rootwise-field-detail-clip"><rect width={width} height={height}/></clipPath>
          </defs>
          <rect width={width} height={height} fill="url(#rootwise-field-detail-grid)"/>
          <g clipPath="url(#rootwise-field-detail-clip)">
            <g transform={detailTransform}>
              {points.length >= 3 && <path d={closedPath} fill="#39a879" fillOpacity=".25" stroke="#16845b" strokeWidth="2.5" strokeLinejoin="round"/>}
              {points.length === 2 && <path d={path} fill="none" stroke="#16845b" strokeWidth="3" strokeLinecap="round"/>}
              {projected.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="5" fill="#126b4b" stroke="#fff" strokeWidth="1.5"/><text x={point.x + 8} y={point.y - 7} fontSize="10" fill="#14543c">{index + 1}</text></g>)}
              {latest && <circle cx={latest.x} cy={latest.y} r="9" fill="none" stroke="#0b8f62" strokeWidth="2" strokeDasharray="3 3"/>}
            </g>
          </g>
        </svg>
        <p className="mt-1 text-[9px] text-[var(--ink-soft)]">{es ? 'El zoom solo cambia la vista de detalle. El área y el perímetro se calculan con todos los puntos GPS y no cambian.' : 'Zoom only changes this detail view. Area and perimeter still use every GPS point and are not changed.'}</p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[var(--ink-soft)]">
        <span>{es ? 'Área calculada' : 'Calculated area'}: <b className="text-[var(--ink)]">{areaM2.toFixed(2)} m²</b></span>
        <span>{es ? 'Perímetro' : 'Perimeter'}: <b className="text-[var(--ink)]">{perimeterM.toFixed(1)} m</b></span>
      </div>
      <p className="mt-2 text-[9px] text-[var(--ink-soft)]">{es ? 'Diagrama proporcional basado en los mismos puntos GPS; no es un mapa ni un plano topográfico.' : 'Proportional diagram from the same GPS points; not a map or certified survey.'}</p>
    </div>
  );
};
