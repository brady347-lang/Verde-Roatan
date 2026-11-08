import React, { useMemo, useState } from 'react';
import { Calculator, Check, CircleDot, Compass, MapPin, Play, RotateCcw, Square, Trees, Waves } from 'lucide-react';
import { Language } from '../types';

interface Props { lang: Language; }
type Point = { lat: number; lon: number; accuracy: number; };
const toRadians = (value: number) => value * Math.PI / 180;

function measurePolygon(points: Point[]) {
  if (points.length < 3) return { area: 0, perimeter: 0 };
  const lat0 = toRadians(points.reduce((sum, point) => sum + point.lat, 0) / points.length);
  const metersPerDegreeLat = 111132.92;
  const metersPerDegreeLon = 111412.84 * Math.cos(lat0);
  const xy = points.map((point) => ({ x: point.lon * metersPerDegreeLon, y: point.lat * metersPerDegreeLat }));
  let twiceArea = 0, perimeter = 0;
  xy.forEach((point, index) => {
    const next = xy[(index + 1) % xy.length];
    twiceArea += point.x * next.y - next.x * point.y;
    perimeter += Math.hypot(next.x - point.x, next.y - point.y);
  });
  return { area: Math.abs(twiceArea) / 2, perimeter };
}

export const ToolsScreen: React.FC<Props> = ({ lang }) => {
  const es = lang === 'es';
  const [points, setPoints] = useState<Point[]>([]);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [length, setLength] = useState('10');
  const [width, setWidth] = useState('8');
  const [depth, setDepth] = useState('0.08');
  const [coverage, setCoverage] = useState('50');
  const [tool, setTool] = useState<'area' | 'materials' | 'irrigation'>('area');
  const measurement = useMemo(() => measurePolygon(points), [points]);
  const capturePoint = () => {
    if (!navigator.geolocation) { setGpsError(es ? 'Este dispositivo no admite GPS en el navegador.' : 'GPS is not available in this browser.'); return; }
    setGpsBusy(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPoints((current) => [...current, { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy }]);
        setGpsBusy(false);
      },
      (error) => {
        setGpsError(error.code === error.PERMISSION_DENIED ? (es ? 'Permite el acceso a la ubicación para medir.' : 'Allow location access to measure the area.') : (es ? 'No se pudo obtener una posición GPS. Inténtalo de nuevo al aire libre.' : 'Could not get a GPS position. Try again outdoors.'));
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };
  const area = measurement.area;
  const m2 = Number(length) * Number(width);
  const volume = m2 * Number(depth);
  const plants = Number(coverage) > 0 ? Math.floor(m2 / (Number(coverage) / 100)) : 0;
  const tabs = [
    { id: 'area' as const, label: es ? 'Área GPS' : 'GPS area', icon: MapPin },
    { id: 'materials' as const, label: es ? 'Materiales' : 'Materials', icon: Calculator },
    { id: 'irrigation' as const, label: es ? 'Riego' : 'Irrigation', icon: Waves }
  ];
  return (
    <div className="flex flex-col gap-4 pb-7">
      <header className="px-1"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'KIT PROFESIONAL' : 'PROFESSIONAL TOOLKIT'}</p><h1 className="text-2xl font-extrabold">{es ? 'Herramientas de paisajismo' : 'Landscape tools'}</h1><p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Mediciones y cálculos prácticos para planificar tu próximo proyecto.' : 'Practical measurements and calculations for your next project.'}</p></header>
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--surface-2)] p-1">
        {tabs.map((item) => <button key={item.id} onClick={() => setTool(item.id)} className={`flex flex-col items-center gap-1 rounded-xl px-1 py-3 text-[11px] font-bold ${tool === item.id ? 'bg-[var(--surface)] text-[var(--palm)] shadow-sm' : 'text-[var(--ink-soft)]'}`}><item.icon className="h-5 w-5" />{item.label}</button>)}
      </div>
      {tool === 'area' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Medición de terreno por GPS' : 'GPS land measurement'}</h2></div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Camina por el perímetro y captura cada esquina. Necesitas al menos tres puntos.' : 'Walk the boundary and capture each corner. At least three points are needed.'}</p>
        <div className="my-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-2xl tabular-nums">{points.length}</b><p className="text-xs text-[var(--ink-soft)]">{es ? 'Puntos capturados' : 'Points captured'}</p></div>
          <div className="rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-2xl tabular-nums">{area >= 10000 ? (area / 10000).toFixed(3) : area.toFixed(1)}</b><p className="text-xs text-[var(--ink-soft)]">{area >= 10000 ? 'ha' : 'm²'} {es ? 'área estimada' : 'estimated area'}</p></div>
        </div>
        {points.length > 0 && <div className="mb-3 rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]"><p>{es ? 'Perímetro estimado' : 'Estimated perimeter'}: <b className="text-[var(--ink)]">{measurement.perimeter.toFixed(1)} m</b></p><p>{es ? 'Precisión GPS promedio' : 'Average GPS accuracy'}: <b className="text-[var(--ink)]">{(points.reduce((sum, point) => sum + point.accuracy, 0) / points.length).toFixed(1)} m</b></p></div>}
        {gpsError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{gpsError}</p>}
        <div className="grid grid-cols-2 gap-2"><button disabled={gpsBusy} onClick={capturePoint} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--palm)] px-3 py-3 text-sm font-bold text-white disabled:opacity-50"><MapPin className="h-4 w-4" />{gpsBusy ? (es ? 'Buscando GPS…' : 'Getting GPS…') : (es ? 'Capturar punto' : 'Capture point')}</button><button onClick={() => setPoints([])} disabled={!points.length || gpsBusy} className="flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-sm font-bold disabled:opacity-40"><RotateCcw className="h-4 w-4" />{es ? 'Reiniciar' : 'Reset'}</button></div>
        {points.length > 0 && <ol className="mt-3 space-y-1 text-[11px] text-[var(--ink-soft)]">{points.map((point, index) => <li key={index}>#{index + 1} · {point.lat.toFixed(6)}, {point.lon.toFixed(6)} · ±{point.accuracy.toFixed(0)}m</li>)}</ol>}
        <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-soft)]">{es ? 'Estimación de campo, no un levantamiento topográfico. La precisión depende del dispositivo, cielo abierto y señal GPS. Revisa los límites antes de cotizar o construir.' : 'Field estimate, not a certified survey. Accuracy depends on device, open sky and GPS signal. Verify boundaries before quoting or construction.'}</p>
      </section>}
      {tool === 'materials' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"><div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Calculadora de materiales' : 'Material calculator'}</h2></div><p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Estimación de tierra, compost o mulch para un área rectangular.' : 'Estimate soil, compost or mulch for a rectangular area.'}</p><div className="mt-4 grid grid-cols-2 gap-3">{[[es?'Largo (m)':'Length (m)',length,setLength],[es?'Ancho (m)':'Width (m)',width,setWidth],[es?'Profundidad (m)':'Depth (m)',depth,setDepth]].map(([label,value,setter]: any) => <label key={label} className="text-xs font-semibold text-[var(--ink-soft)]">{label}<input type="number" min="0" step="0.01" value={value} onChange={(event) => setter(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label>)}</div><div className="mt-4 rounded-2xl bg-[var(--surface-2)] p-4"><p className="text-xs text-[var(--ink-soft)]">{es ? 'Volumen requerido' : 'Estimated volume'}</p><b className="text-3xl">{Number.isFinite(volume) ? volume.toFixed(2) : '0.00'} m³</b><p className="mt-1 text-xs text-[var(--ink-soft)]">{m2.toFixed(2)} m² × {Number(depth).toFixed(2)} m</p></div></section>}
      {tool === 'irrigation' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"><div className="flex items-center gap-2"><Waves className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Planificador básico de riego' : 'Basic irrigation planner'}</h2></div><p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Estimación de emisores según separación aproximada.' : 'Estimate emitter count from approximate spacing.'}</p><label className="mt-4 block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Área por planta (m²)' : 'Area per plant (m²)'}<input type="number" min="0.01" step="0.01" value={coverage} onChange={(event) => setCoverage(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label><div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-4"><p className="text-xs text-[var(--ink-soft)]">{es ? 'Plantas / emisores estimados' : 'Estimated plants / emitters'}</p><b className="text-3xl">{Number.isFinite(plants) ? plants : 0}</b><p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Basado en el área rectangular indicada: ' : 'Based on entered rectangular area: '}{m2.toFixed(1)} m²</p></div><p className="mt-3 text-[10px] text-[var(--ink-soft)]">{es ? 'No sustituye el diseño hidráulico: presión, caudal, pendientes y necesidades de cada especie deben verificarse.' : 'Not a hydraulic design. Verify pressure, flow, slope and species-specific water needs.'}</p></section>}
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] p-3 text-xs text-[var(--ink-soft)]"><Trees className="h-4 w-4 shrink-0 text-[var(--palm)]" />{es ? 'Más herramientas profesionales se añadirán aquí: diseño de jardines, estimación de plantas y planificación de proyectos.' : 'More professional tools will be added here: garden layouts, plant quantities and project planning.'}</div>
    </div>
  );
};
