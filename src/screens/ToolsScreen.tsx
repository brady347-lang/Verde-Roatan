import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, MapPin, RotateCcw, Trees, Waves, Sun, Leaf, Activity } from 'lucide-react';
import { assessLight, recommendPlantsForLight } from '../services/lightIntelligence';
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
  const [depth, setDepth] = useState('0.08');
  const [coverage, setCoverage] = useState('50');
  const [plantSpacing, setPlantSpacing] = useState('0.5');
  const [manualLength, setManualLength] = useState('10');
  const [manualWidth, setManualWidth] = useState('8');
  const [waste, setWaste] = useState('10');
  const [bagLiters, setBagLiters] = useState('40');
  const [tool, setTool] = useState<'area' | 'materials' | 'irrigation' | 'light'>('area');
  const [luxInput, setLuxInput] = useState('12000');
  const [liveLux, setLiveLux] = useState<number | null>(null);
  const [sensorStatus, setSensorStatus] = useState('');
  const sensorRef = useRef<{ stop: () => void } | null>(null);
  const lux = liveLux ?? Math.max(0, Number(luxInput) || 0);
  const lightAssessment = useMemo(() => assessLight(lux), [lux]);
  const lightMatches = useMemo(() => recommendPlantsForLight(lux), [lux]);
  useEffect(() => () => { sensorRef.current?.stop(); }, []);
  const startLightSensor = () => {
    type SensorLike = { illuminance?: number; start: () => void; stop: () => void; addEventListener: (name: string, callback: () => void) => void; onerror: ((event: unknown) => void) | null };
    const Sensor = (window as unknown as { AmbientLightSensor?: new (options?: { frequency?: number }) => SensorLike }).AmbientLightSensor;
    if (!Sensor) { setSensorStatus(es ? 'El sensor de luz ambiental no está disponible en este navegador. Introduce los lux manualmente.' : 'Ambient light sensor is not available in this browser. Enter lux manually.'); return; }
    try {
      const sensor = new Sensor({ frequency: 1 });
      sensor.addEventListener('reading', () => { if (typeof sensor.illuminance === 'number' && Number.isFinite(sensor.illuminance)) setLiveLux(sensor.illuminance); });
      sensor.onerror = () => setSensorStatus(es ? 'No se pudo leer el sensor. Revisa los permisos del dispositivo.' : 'Could not read the sensor. Check device permissions.');
      sensor.start(); sensorRef.current = sensor; setSensorStatus(es ? 'Sensor activo: lectura ambiental en tiempo real.' : 'Sensor active: live ambient reading.');
    } catch { setSensorStatus(es ? 'El dispositivo bloqueó el sensor. Puedes introducir los lux manualmente.' : 'The device blocked the sensor. You can enter lux manually.'); }
  };
  const stopLightSensor = () => { sensorRef.current?.stop(); sensorRef.current = null; setLiveLux(null); setSensorStatus(es ? 'Sensor detenido.' : 'Sensor stopped.'); };
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
  const manualArea = Math.max(0, Number(manualLength) || 0) * Math.max(0, Number(manualWidth) || 0);
  const measuredArea = points.length >= 3 ? area : manualArea;
  const m2 = measuredArea;
  const safeDepth = Math.max(0, Number(depth) || 0);
  const safeWaste = Math.max(0, Number(waste) || 0);
  const volume = measuredArea * safeDepth * (1 + safeWaste / 100);
  const bags = Number(bagLiters) > 0 ? Math.ceil(volume * 1000 / Number(bagLiters)) : 0;
  const spacing = Math.max(0, Number(plantSpacing) || 0);
  const plants = spacing > 0 ? Math.floor(measuredArea / (spacing * spacing)) : 0;
  const areaAcres = measuredArea / 4046.8564224;
  const areaSqFt = measuredArea * 10.7639104167;
  const tabs = [
    { id: 'area' as const, label: es ? 'Área GPS' : 'GPS area', icon: MapPin },
    { id: 'materials' as const, label: es ? 'Materiales' : 'Materials', icon: Calculator },
    { id: 'irrigation' as const, label: es ? 'Riego' : 'Irrigation', icon: Waves },
    { id: 'light' as const, label: es ? 'Luz' : 'Light', icon: Sun }
  ];
  return (
    <div className="flex flex-col gap-4 pb-7">
      <header className="px-1"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'KIT PROFESIONAL' : 'PROFESSIONAL TOOLKIT'}</p><h1 className="text-2xl font-extrabold">{es ? 'Herramientas de paisajismo' : 'Landscape tools'}</h1><p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Mediciones y cálculos prácticos para planificar tu próximo proyecto.' : 'Practical measurements and calculations for your next project.'}</p></header>
      <div className="grid grid-cols-4 gap-2 rounded-2xl bg-[var(--surface-2)] p-1">
        {tabs.map((item) => <button key={item.id} onClick={() => setTool(item.id)} className={`flex flex-col items-center gap-1 rounded-xl px-1 py-3 text-[11px] font-bold ${tool === item.id ? 'bg-[var(--surface)] text-[var(--palm)] shadow-sm' : 'text-[var(--ink-soft)]'}`}><item.icon className="h-5 w-5" />{item.label}</button>)}
      </div>
      {tool === 'area' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Medición de terreno por GPS' : 'GPS land measurement'}</h2></div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Camina por el borde de la cama o terreno y captura cada esquina. También puedes introducir largo y ancho manualmente.' : 'Walk the edge of the bed or site and capture each corner. You can also enter length and width manually.'}</p>
        <div className="my-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-2xl tabular-nums">{points.length}</b><p className="text-xs text-[var(--ink-soft)]">{es ? 'Puntos capturados' : 'Points captured'}</p></div>
          <div className="rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-2xl tabular-nums">{points.length >= 3 ? (area >= 10000 ? (area / 10000).toFixed(3) : area.toFixed(1)) : manualArea.toFixed(1)}</b><p className="text-xs text-[var(--ink-soft)]">{points.length >= 3 && area >= 10000 ? 'ha' : 'm²'} {es ? 'área estimada' : 'estimated area'}</p></div>
        </div>
        {points.length > 0 && <div className="mb-3 rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]"><p>{es ? 'Perímetro estimado' : 'Estimated perimeter'}: <b className="text-[var(--ink)]">{measurement.perimeter.toFixed(1)} m</b></p><p>{es ? 'Precisión GPS promedio' : 'Average GPS accuracy'}: <b className="text-[var(--ink)]">{(points.reduce((sum, point) => sum + point.accuracy, 0) / points.length).toFixed(1)} m</b></p></div>}
        <div className="mb-3 rounded-2xl bg-[var(--surface-2)] p-3">
          <p className="mb-2 text-xs font-bold">{es ? 'O medir manualmente (área rectangular)' : 'Or enter dimensions manually (rectangular area)'}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[var(--ink-soft)]">{es ? 'Largo (m)' : 'Length (m)'}<input type="number" min="0" step="0.1" value={manualLength} onChange={e=>setManualLength(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2 text-sm text-[var(--ink)]" /></label>
            <label className="text-xs text-[var(--ink-soft)]">{es ? 'Ancho (m)' : 'Width (m)'}<input type="number" min="0" step="0.1" value={manualWidth} onChange={e=>setManualWidth(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2 text-sm text-[var(--ink)]" /></label>
          </div>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">{es ? 'Área equivalente' : 'Calculated area'}: <b className="text-[var(--ink)]">{manualArea.toFixed(2)} m²</b></p>
        </div>
        <div className="mb-3 rounded-2xl border border-[var(--line)] p-3">
          <p className="text-xs font-bold">{es ? 'Plan de plantación' : 'Planting layout estimate'}</p>
          <label className="mt-2 block text-xs text-[var(--ink-soft)]">{es ? 'Separación entre plantas (m)' : 'Plant spacing (m)'}<input type="number" min="0.05" step="0.05" value={plantSpacing} onChange={e=>setPlantSpacing(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2 text-sm text-[var(--ink)]" /></label>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-[var(--surface-2)] p-2"><b className="text-xl">{plants}</b><p className="text-[var(--ink-soft)]">{es ? 'Plantas estimadas' : 'Estimated plants'}</p></div><div className="rounded-xl bg-[var(--surface-2)] p-2"><b className="text-xl">{spacing > 0 ? (1/(spacing*spacing)).toFixed(1) : '—'}</b><p className="text-[var(--ink-soft)]">{es ? 'Plantas por m²' : 'Plants per m²'}</p></div></div>
          <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{es ? 'Estimación con patrón cuadrado; descuenta caminos, bordes y obstáculos. La separación real depende de la especie y tamaño adulto.' : 'Square-grid estimate; subtract paths, edges and obstacles. Actual spacing depends on species and mature size.'}</p>
        </div>
        {gpsError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{gpsError}</p>}
        <div className="grid grid-cols-2 gap-2"><button disabled={gpsBusy} onClick={capturePoint} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--palm)] px-3 py-3 text-sm font-bold text-white disabled:opacity-50"><MapPin className="h-4 w-4" />{gpsBusy ? (es ? 'Buscando GPS…' : 'Getting GPS…') : (es ? 'Capturar punto' : 'Capture point')}</button><button onClick={() => setPoints([])} disabled={!points.length || gpsBusy} className="flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-sm font-bold disabled:opacity-40"><RotateCcw className="h-4 w-4" />{es ? 'Reiniciar' : 'Reset'}</button></div>
        {points.length > 0 && <button onClick={() => setPoints(current => current.slice(0,-1))} className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold">{es ? 'Deshacer último punto' : 'Undo last point'}</button>}
        {points.length > 0 && <ol className="mt-3 space-y-1 text-[11px] text-[var(--ink-soft)]">{points.map((point, index) => <li key={index}>#{index + 1} · {point.lat.toFixed(6)}, {point.lon.toFixed(6)} · ±{point.accuracy.toFixed(0)}m</li>)}</ol>}
        <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-soft)]">{es ? 'Estimación de campo, no un levantamiento topográfico. La precisión depende del dispositivo, cielo abierto y señal GPS. Revisa los límites antes de cotizar o construir.' : 'Field estimate, not a certified survey. Accuracy depends on device, open sky and GPS signal. Verify boundaries before quoting or construction.'}</p>
      </section>}
      {tool === 'materials' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Calculadora de suelo y materiales' : 'Soil & materials calculator'}</h2></div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Usa el área GPS capturada o las dimensiones manuales para calcular el volumen de relleno.' : 'Use your GPS-measured area or manual dimensions to calculate fill volume.'}</p>
        <div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3"><p className="text-xs text-[var(--ink-soft)]">{es ? 'Área que se usará' : 'Area being used'}</p><b className="text-2xl">{measuredArea.toFixed(2)} m²</b><p className="text-xs text-[var(--ink-soft)]">{areaSqFt.toFixed(1)} ft² · {areaAcres.toFixed(4)} acres</p></div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Profundidad (cm)' : 'Depth (cm)'}<input type="number" min="0" step="1" value={Number(depth)*100} onChange={e=>setDepth(String(Math.max(0,Number(e.target.value)||0)/100))} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label>
          <label className="text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Extra por asentamiento (%)' : 'Extra for settling (%)'}<input type="number" min="0" max="50" step="1" value={waste} onChange={e=>setWaste(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label>
          <label className="col-span-2 text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Volumen por saco (litros)' : 'Volume per bag (liters)'}<input type="number" min="1" step="1" value={bagLiters} onChange={e=>setBagLiters(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label>
        </div>
        <div className="mt-4 rounded-2xl bg-[var(--surface-2)] p-4">
          <p className="text-xs text-[var(--ink-soft)]">{es ? 'Volumen estimado necesario' : 'Estimated material volume'}</p><b className="text-3xl">{volume.toFixed(2)} m³</b><p className="mt-1 text-xs text-[var(--ink-soft)]">{(volume*1000).toFixed(0)} L · {bags} {es ? 'sacos aproximados' : 'approximate bags'}</p>
          <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{measuredArea.toFixed(2)} m² × {safeDepth.toFixed(2)} m × {(1+safeWaste/100).toFixed(2)} factor</p>
        </div>
        <p className="mt-3 text-[10px] text-[var(--ink-soft)]">{es ? 'Cálculo geométrico de volumen. La cantidad real puede variar por compactación, pendiente, asentamiento y densidad del material.' : 'Geometric volume estimate. Actual quantities vary with compaction, slope, settling and material density.'}</p>
      </section>}
      {tool === 'irrigation' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"><div className="flex items-center gap-2"><Waves className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Planificador básico de riego' : 'Basic irrigation planner'}</h2></div><p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Estimación de emisores según separación aproximada.' : 'Estimate emitter count from approximate spacing.'}</p><label className="mt-4 block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Área por planta (m²)' : 'Area per plant (m²)'}<input type="number" min="0.01" step="0.01" value={coverage} onChange={(event) => setCoverage(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label><div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-4"><p className="text-xs text-[var(--ink-soft)]">{es ? 'Plantas / emisores estimados' : 'Estimated plants / emitters'}</p><b className="text-3xl">{Number.isFinite(plants) ? plants : 0}</b><p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Basado en el área medida o introducida: ' : 'Based on measured or manually entered area: '}{m2.toFixed(1)} m²</p></div><p className="mt-3 text-[10px] text-[var(--ink-soft)]">{es ? 'No sustituye el diseño hidráulico: presión, caudal, pendientes y necesidades de cada especie deben verificarse.' : 'Not a hydraulic design. Verify pressure, flow, slope and species-specific water needs.'}</p></section>}
      {tool === 'light' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2"><Sun className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Medidor inteligente de luz' : 'Intelligent light meter'}</h2></div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Mide la iluminación del lugar y consulta qué plantas del Centro de Conocimiento Botánico se adaptan mejor.' : 'Measure the location brightness and discover which plants in the Botanical Knowledge Center may fit.'}</p>
        <div className="my-4 rounded-2xl bg-[var(--surface-2)] p-4 text-center"><Sun className="mx-auto h-8 w-8 text-amber-500" /><b className="mt-2 block text-3xl tabular-nums">{Math.round(lux).toLocaleString()} lux</b><p className="text-sm font-bold">{lightAssessment.label}</p><p className="mt-1 text-xs text-[var(--ink-soft)]">{lightAssessment.guidance}</p></div>
        <label className="block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Lectura de luz (lux)' : 'Light reading (lux)'}<input type="number" min="0" max="200000" value={luxInput} onChange={event => { setLuxInput(event.target.value); setLiveLux(null); }} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label>
        <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={startLightSensor} className="rounded-xl bg-[var(--palm)] px-3 py-3 text-xs font-bold text-white"><Activity className="mr-1 inline h-4 w-4" />{es ? 'Leer sensor' : 'Read sensor'}</button><button onClick={stopLightSensor} className="rounded-xl border border-[var(--line)] px-3 py-3 text-xs font-bold">{es ? 'Detener sensor' : 'Stop sensor'}</button></div>
        {sensorStatus && <p className="mt-2 text-xs text-[var(--ink-soft)]" role="status">{sensorStatus}</p>}
        <div className="mt-5"><h3 className="flex items-center gap-2 text-base font-extrabold"><Leaf className="h-4 w-4 text-[var(--palm)]" />{es ? 'Plantas recomendadas' : 'Recommended plants'}</h3><p className="mb-3 mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Coincidencias basadas en los requisitos de luz registrados en el Centro de Conocimiento.' : 'Matches based on sunlight requirements recorded in the Botanical Knowledge Center.'}</p>
          {lightMatches.length ? <div className="space-y-2">{lightMatches.map(match => <div key={match.profile.id} className="rounded-2xl border border-[var(--line)] p-3"><div className="flex items-start justify-between gap-2"><div><b className="text-sm">{match.profile.identification.common_names[es ? 'es' : 'en'][0] || match.profile.taxonomy.scientific_name}</b><p className="text-xs italic text-[var(--ink-soft)]">{match.profile.taxonomy.scientific_name}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${match.fit === 'strong' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{match.fit === 'strong' ? (es ? 'Buena coincidencia' : 'Strong fit') : (es ? 'Posible' : 'Possible fit')}</span></div><p className="mt-1 text-xs text-[var(--ink-soft)]">{match.reason}</p></div>)}</div> : <p className="rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]">{es ? 'No hay perfiles públicos coincidentes todavía.' : 'No matching public profiles are available yet.'}</p>}
        </div>
        <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-3 text-[10px] leading-relaxed text-[var(--ink-soft)]">{es ? 'Una lectura puntual de lux no mide la luz diaria total ni la radiación fotosintética (PPFD/DLI). El sensor depende del hardware y permisos del teléfono. Observa el lugar durante varias horas antes de plantar.' : 'A single lux reading does not measure daily light integral or photosynthetic radiation (PPFD/DLI). Sensor availability depends on phone hardware and permissions. Observe the location across several hours before planting.'}</p>
      </section>}
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] p-3 text-xs text-[var(--ink-soft)]"><Trees className="h-4 w-4 shrink-0 text-[var(--palm)]" />{es ? 'Más herramientas profesionales se añadirán aquí: diseño de jardines, estimación de plantas y planificación de proyectos.' : 'More professional tools will be added here: garden layouts, plant quantities and project planning.'}</div>
    </div>
  );
};
