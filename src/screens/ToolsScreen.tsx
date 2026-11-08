import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Calculator, Check, CircleDot, Compass, MapPin, Play, RotateCcw, Square, Trees, Waves } from 'lucide-react';
import { CatalogItem, Language } from '../types';
import { deleteMeasuredPlot, listSavedPlots, saveMeasuredPlot, type SavedPlot } from '../lib/measuredPlotStore';

interface Props { lang: Language; catalog: CatalogItem[]; }
type Point = { lat: number; lon: number; accuracy: number; };
type MaterialType = '' | 'mulch' | 'gravel' | 'topsoil' | 'compost' | 'pavers';
const MATERIAL_LABELS: Record<Exclude<MaterialType, ''>, { en: string; es: string; terms: RegExp }> = {
  mulch: { en: 'Natural mulch', es: 'Mulch natural', terms: /mulch|bark|wood chip|corteza/i },
  gravel: { en: 'Gravel & stone', es: 'Grava y piedra', terms: /gravel|stone|aggregate|crushed rock|grava|piedra/i },
  topsoil: { en: 'Topsoil', es: 'Tierra vegetal', terms: /topsoil|top soil|planting soil|tierra vegetal/i },
  compost: { en: 'Compost & soil blend', es: 'Compost y mezcla de suelo', terms: /compost|soil blend|soil mix|coir|worm cast/i },
  pavers: { en: 'Pavers & stepping stones', es: 'Adoquines y losas', terms: /paver|stepping stone|patio block|adoqu[ií]n|losa/i }
};
function MapViewport({ points }: { points: Point[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = points.map((point) => [point.lat, point.lon] as [number, number]);
    if (bounds.length === 1) map.setView(bounds[0], 18);
    else map.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
  }, [map, points]);
  return null;
}
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

export const ToolsScreen: React.FC<Props> = ({ lang, catalog }) => {
  const es = lang === 'es';
  const [points, setPoints] = useState<Point[]>([]);
  const [savedPlots, setSavedPlots] = useState<SavedPlot[]>([]);
  const [plotName, setPlotName] = useState('');
  const [plotNotes, setPlotNotes] = useState('');
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [plotStorageError, setPlotStorageError] = useState('');
  useEffect(() => {
    let active = true;
    listSavedPlots().then((plots) => { if (active) setSavedPlots(plots); }).catch(() => {
      if (active) setPlotStorageError(es ? 'No se pudo abrir el almacenamiento local de mapas.' : 'Could not open local map storage.');
    });
    return () => { active = false; };
  }, [es]);
  const handleSavePlot = async () => {
    if (points.length < 3) return;
    const now = new Date().toISOString();
    const plot: SavedPlot = {
      id: editingPlotId || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'plot-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      name: plotName.trim() || (es ? 'Terreno ' : 'Garden plot ') + new Date().toLocaleDateString(),
      points: points.map((point) => ({ ...point })),
      areaM2: measurement.area,
      perimeterM: measurement.perimeter,
      notes: plotNotes.trim(),
      plantSpacingM: spacing,
      estimatedPlants: plants,
      surfaceMaterialId: selectedSod?.id,
      surfaceMaterialName: selectedSod?.name,
      surfaceMaterialUnits: sodUnitsNeeded,
      projectMaterialType: materialType || undefined,
      projectMaterialId: selectedMaterial?.id,
      projectMaterialName: selectedMaterial?.name,
      projectMaterialUnits: materialUnitsNeeded || undefined,
      createdAt: savedPlots.find((item) => item.id === editingPlotId)?.createdAt || now,
      updatedAt: now
    };
    try {
      await saveMeasuredPlot(plot);
      setSavedPlots(await listSavedPlots());
      setEditingPlotId(plot.id);
      setPlotStorageError('');
    } catch {
      setPlotStorageError(es ? 'No se pudo guardar. Comprueba el espacio disponible en el dispositivo.' : 'Could not save this map. Check available device storage.');
    }
  };
  const handleOpenPlot = (plot: SavedPlot) => {
    setPoints(plot.points.map((point) => ({ ...point })));
    setPlotName(plot.name);
    setPlotNotes(plot.notes || '');
    setPlantSpacing(String(plot.plantSpacingM || 0.5));
    setSelectedSodId(plot.surfaceMaterialId || '');
    setMaterialType((plot.projectMaterialType as MaterialType) || '');
    setSelectedMaterialId(plot.projectMaterialId || '');
    setEditingPlotId(plot.id);
    setGpsError('');
    setTool('area');
  };
  const handleDeletePlot = async (id: string) => {
    try {
      await deleteMeasuredPlot(id);
      setSavedPlots(await listSavedPlots());
      setPlotStorageError('');
    } catch {
      setPlotStorageError(es ? 'No se pudo eliminar el mapa guardado.' : 'Could not delete the saved map.');
    }
  };
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [depth, setDepth] = useState('0.08');
  const [coverage, setCoverage] = useState('50');
  const [selectedSodId, setSelectedSodId] = useState('');
  const [materialType, setMaterialType] = useState<MaterialType>('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [plantSpacing, setPlantSpacing] = useState('0.5');
  const [manualLength, setManualLength] = useState('10');
  const [manualWidth, setManualWidth] = useState('8');
  const [waste, setWaste] = useState('10');
  const [bagLiters, setBagLiters] = useState('40');
  const [tool, setTool] = useState<'area' | 'materials' | 'irrigation'>('area');
  const measurement = useMemo(() => measurePolygon(points), [points]);
  const sodOptions = useMemo(() => catalog.filter((item) => item.kind === 'grass' && /sod|zoysia|natural grass/i.test([item.name, item.sci, item.category, ...item.tags].join(' ')) && !/artificial|synthetic/i.test([item.name, item.category, ...item.tags].join(' '))), [catalog]);
  const selectedSod = sodOptions.find((item) => item.id === selectedSodId) || sodOptions[0];
  const materialOptions = useMemo(() => materialType ? catalog.filter((item) => MATERIAL_LABELS[materialType].terms.test([item.name, item.sci, item.category, ...item.tags].join(' ')) && !/artificial|synthetic/i.test([item.name, item.category, ...item.tags].join(' '))) : [], [catalog, materialType]);
  const selectedMaterial = materialOptions.find((item) => item.id === selectedMaterialId) || materialOptions[0];
  const capturePoint = async () => {
    setGpsBusy(true);
    setGpsError('');
    try {
      let latitude: number;
      let longitude: number;
      let accuracy: number;
      if (Capacitor.isNativePlatform()) {
        let permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') permission = await Geolocation.requestPermissions();
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') throw new Error('LOCATION_PERMISSION_DENIED');
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
        latitude = position.coords.latitude; longitude = position.coords.longitude; accuracy = position.coords.accuracy;
      } else {
        if (!navigator.geolocation) throw new Error('GEOLOCATION_UNAVAILABLE');
        if (!window.isSecureContext) throw new Error('GEOLOCATION_REQUIRES_HTTPS');
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }));
        latitude = position.coords.latitude; longitude = position.coords.longitude; accuracy = position.coords.accuracy;
      }
      setPoints((current) => [...current, { lat: latitude, lon: longitude, accuracy }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = typeof error === 'object' && error !== null && 'code' in error ? Number((error as { code?: unknown }).code) : 0;
      const denied = message === 'LOCATION_PERMISSION_DENIED' || code === 1 || /permission|denied/i.test(message);
      setGpsError(denied
        ? (es ? 'El permiso de ubicación está denegado. Actívalo en Ajustes de Android → Aplicaciones → Rootwise → Permisos → Ubicación y vuelve a intentarlo.' : 'Location permission is denied. Enable it in Android Settings → Apps → Rootwise → Permissions → Location, then try again.')
        : message === 'GEOLOCATION_REQUIRES_HTTPS'
          ? (es ? 'La ubicación del navegador requiere una conexión segura HTTPS.' : 'Browser location requires a secure HTTPS connection.')
          : message === 'GEOLOCATION_UNAVAILABLE'
            ? (es ? 'Este navegador no ofrece geolocalización. Usa la aplicación Android o introduce las medidas manualmente.' : 'This browser does not provide geolocation. Use the Android app or enter dimensions manually.')
            : (es ? 'No se pudo obtener GPS. Comprueba que la ubicación del teléfono esté activada, permite ubicación precisa para Rootwise y vuelve a intentarlo al aire libre.' : 'GPS could not get a position. Check that phone Location is on, allow precise location for Rootwise, and try again outdoors.'));
    } finally { setGpsBusy(false); }
  };
  const area = measurement.area;
  const manualArea = Math.max(0, Number(manualLength) || 0) * Math.max(0, Number(manualWidth) || 0);
  const measuredArea = points.length >= 3 ? area : manualArea;
  const sodSquareYards = measuredArea / 0.83612736;
  const sodUnitsNeeded = Math.ceil(sodSquareYards);
  const sodTotal = selectedSod ? sodUnitsNeeded * selectedSod.price : 0;
  const sodAvailable = selectedSod ? Math.max(0, selectedSod.stock_quantity || 0) : 0;
  const m2 = measuredArea;
  const safeDepth = Math.max(0, Number(depth) || 0);
  const safeWaste = Math.max(0, Number(waste) || 0);
  const volume = measuredArea * safeDepth * (1 + safeWaste / 100);
  const bags = Number(bagLiters) > 0 ? Math.ceil(volume * 1000 / Number(bagLiters)) : 0;
  const selectedMaterialLiters = selectedMaterial ? Number(([selectedMaterial.size, selectedMaterial.sci, selectedMaterial.name].join(' ').match(/(\\d+(?:\\.\\d+)?)\\s*(?:l|liter|litre)s?\\b/i) || [])[1]) : 0;
  const materialUnitsNeeded = selectedMaterialLiters > 0 ? Math.ceil(volume * 1000 / selectedMaterialLiters) : 0;
  const materialTotal = selectedMaterial && materialUnitsNeeded > 0 ? materialUnitsNeeded * selectedMaterial.price : 0;
  const spacing = Math.max(0, Number(plantSpacing) || 0);
  const plants = spacing > 0 ? Math.floor(measuredArea / (spacing * spacing)) : 0;
  const safeCoverage = Math.max(0, Number(coverage) || 0);
  const irrigationEmitters = safeCoverage > 0 ? Math.floor(measuredArea / safeCoverage) : 0;
  const areaAcres = measuredArea / 4046.8564224;
  const areaSqFt = measuredArea * 10.7639104167;
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
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Camina por el borde de la cama o terreno y captura cada esquina. También puedes introducir largo y ancho manualmente.' : 'Walk the edge of the bed or site and capture each corner. You can also enter length and width manually.'}</p>
        <div className="my-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-2xl tabular-nums">{points.length}</b><p className="text-xs text-[var(--ink-soft)]">{es ? 'Puntos capturados' : 'Points captured'}</p></div>
          <div className="rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-2xl tabular-nums">{points.length >= 3 ? (area >= 10000 ? (area / 10000).toFixed(3) : area.toFixed(1)) : manualArea.toFixed(1)}</b><p className="text-xs text-[var(--ink-soft)]">{points.length >= 3 && area >= 10000 ? 'ha' : 'm²'} {es ? 'área estimada' : 'estimated area'}</p></div>
        </div>
        {points.length > 0 && <div className="mb-3 rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]"><p>{es ? 'Perímetro estimado' : 'Estimated perimeter'}: <b className="text-[var(--ink)]">{measurement.perimeter.toFixed(1)} m</b></p><p>{es ? 'Precisión GPS promedio' : 'Average GPS accuracy'}: <b className="text-[var(--ink)]">{(points.reduce((sum, point) => sum + point.accuracy, 0) / points.length).toFixed(1)} m</b></p></div>}
        {points.length > 0 && <div className="mb-3 overflow-hidden rounded-2xl border border-[var(--line)]">
          <div className="flex items-center justify-between bg-[var(--surface-2)] px-3 py-2"><b className="text-xs">{es ? "Mapa del terreno medido" : "Measured land map"}</b><span className="text-[10px] text-[var(--ink-soft)]">{points.length >= 3 ? (es ? "Perímetro trazado" : "Boundary plotted") : (es ? "Puntos GPS" : "GPS points")}</span></div>
          <MapContainer center={[points[0].lat, points[0].lon]} zoom={18} scrollWheelZoom={false} style={{ height: "280px", width: "100%" }}>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapViewport points={points} />
            {points.length === 2 && <Polyline positions={points.map((point) => [point.lat, point.lon] as [number, number])} pathOptions={{ color: "#16845B", weight: 4 }} /> }
            {points.length >= 3 && <Polygon positions={points.map((point) => [point.lat, point.lon] as [number, number])} pathOptions={{ color: "#16845B", weight: 3, fillColor: "#39A879", fillOpacity: 0.28 }} /> }
            {points.map((point, index) => <CircleMarker key={index} center={[point.lat, point.lon]} radius={7} pathOptions={{ color: "#FFFFFF", weight: 2, fillColor: "#126B4B", fillOpacity: 1 }} />)}
          </MapContainer>
          {points.length < 3 && <p className="bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">{es ? "Captura al menos 3 esquinas para cerrar y calcular el área del polígono." : "Capture at least 3 corners to close the boundary and calculate its area."}</p>}
        </div>}
        {points.length === 0 && <div className="mb-3 overflow-hidden rounded-2xl border border-[var(--line)] p-3">
          <b className="text-xs">{es ? "Vista previa del área rectangular" : "Rectangular area preview"}</b>
          <svg viewBox="0 0 320 150" role="img" aria-label={es ? "Diagrama rectangular del área manual" : "Manual rectangular area diagram"} className="mt-2 h-36 w-full">
            <defs><pattern id="rootwise-area-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 L 0 0 0 16" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="1" /></pattern></defs>
            <rect x="1" y="1" width="318" height="148" fill="url(#rootwise-area-grid)" />
            <rect x="72" y="30" width="176" height="88" rx="5" fill="#39A879" fillOpacity=".22" stroke="#16845B" strokeWidth="3" />
            <text x="160" y="25" textAnchor="middle" fontSize="10" fill="currentColor">{manualLength || "0"} m</text>
            <text x="258" y="77" fontSize="10" fill="currentColor">{manualWidth || "0"} m</text>
            <text x="160" y="78" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{manualArea.toFixed(1)} m²</text>
          </svg>
          <p className="text-[10px] text-[var(--ink-soft)]">{es ? "Diagrama aproximado, no un mapa geográfico. Captura puntos GPS para ver el terreno sobre el mapa." : "Approximate diagram, not a geographic map. Capture GPS points to see the site on a real map."}</p>
        </div>}

        <div className="mb-3 rounded-2xl border border-[var(--line)] p-3">
          <p className="text-xs font-bold">{es ? 'Planificador de césped y materiales de superficie' : 'Lawn & surface-material planner'}</p>
          <p className="mt-1 text-[11px] text-[var(--ink-soft)]">{es ? 'Calcula césped natural para jardines y áreas verdes. No incluye césped artificial.' : 'Estimate natural grass sod for lawns and green spaces. Artificial turf is not offered.'}</p>
          {sodOptions.length > 0 ? <>
            <label className="mt-3 block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Elegir césped natural del catálogo' : 'Choose natural sod from catalog'}
              <select value={selectedSod ? selectedSod.id : ''} onChange={(event) => setSelectedSodId(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]">
                {sodOptions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.size}</option>)}
              </select>
            </label>
            {selectedSod && <div className="mt-3 rounded-xl bg-[var(--surface-2)] p-3">
              <div className="flex items-start justify-between gap-2"><div><b className="text-sm">{selectedSod.name}</b><p className="text-[10px] text-[var(--ink-soft)]">{selectedSod.size} · {selectedSod.nursery}</p></div><span className="rounded-full bg-[var(--palm)]/15 px-2 py-1 text-[10px] font-bold text-[var(--palm)]">{selectedSod.stock_quantity > 0 && selectedSod.stock !== 'Out of stock' ? (es ? 'En catálogo' : 'In catalog') : (es ? 'Sin existencias' : 'Out of stock')}</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-[var(--ink-soft)]">{es ? 'Cantidad necesaria' : 'Quantity needed'}</p><b className="text-xl">{sodUnitsNeeded} {es ? 'losas yd²' : 'sq yd slabs'}</b></div>
                <div><p className="text-[var(--ink-soft)]">{es ? 'Existencias registradas' : 'Recorded stock'}</p><b className="text-xl">{sodAvailable}</b></div>
                <div><p className="text-[var(--ink-soft)]">{es ? 'Precio por unidad' : 'Price per unit'}</p><b>{selectedSod.currency} {selectedSod.price.toFixed(2)}</b></div>
                <div><p className="text-[var(--ink-soft)]">{es ? 'Subtotal estimado' : 'Estimated subtotal'}</p><b>{selectedSod.currency} {sodTotal.toFixed(2)}</b></div>
              </div>
              <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{sodUnitsNeeded > sodAvailable ? (es ? 'La cantidad calculada supera las existencias registradas. Contacta al vivero para confirmar disponibilidad o solicitar abastecimiento.' : 'Calculated quantity exceeds recorded stock. Contact the nursery to confirm availability or request sourcing.') : (es ? 'Existencias suficientes según el registro actual; confirma antes de comprar.' : 'Recorded stock appears sufficient; confirm availability before purchase.')}</p>
            </div>}
          </> : <p className="mt-2 rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]">{es ? 'No hay césped natural en rollo o losa registrado actualmente en el catálogo. Puedes seguir usando el área para otros cálculos.' : 'No natural sod products are currently listed in the catalog. You can still use the area for other calculations.'}</p>}
          <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{es ? 'Estimación basada en losas de 1 yd²; incluye redondeo hacia arriba, no contempla cortes, desperdicio ni pendientes.' : 'Estimate assumes 1 sq yd slabs and rounds up; excludes cuts, waste and slopes.'}</p>
        </div>
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
        {plotStorageError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{plotStorageError}</p>}
        {points.length >= 3 && <div className="mb-3 rounded-2xl border border-[var(--line)] p-3">
          <p className="mb-2 text-xs font-bold">{es ? 'Guardar este mapa en el dispositivo' : 'Save this map on this device'}</p>
          <input aria-label={es ? 'Nombre del terreno' : 'Plot name'} value={plotName} onChange={(event) => setPlotName(event.target.value)} placeholder={es ? 'Nombre del terreno (opcional)' : 'Plot name (optional)'} className="mb-2 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          <label className="mb-2 block text-xs text-[var(--ink-soft)]">{es ? 'Notas del sitio (suelo, sombra, pendientes, obstáculos...)' : 'Site notes (soil, shade, slope, obstacles...)'}
            <textarea value={plotNotes} onChange={(event) => setPlotNotes(event.target.value)} rows={3} maxLength={1200} placeholder={es ? 'Añade detalles útiles para el proyecto...' : 'Add useful project details...'} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          </label>
          <button onClick={handleSavePlot} className="w-full rounded-xl bg-[var(--palm)] px-3 py-2 text-xs font-bold text-white">{editingPlotId ? (es ? 'Actualizar terreno' : 'Update plot') : (es ? 'Guardar mapa' : 'Save map')}</button>
          <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{es ? 'Las coordenadas se guardan solo en este dispositivo; no se suben a la nube.' : 'Coordinates are stored only on this device; they are not uploaded to the cloud.'}</p>
        </div>}
        <div className="mb-3 rounded-2xl border border-[var(--line)] p-3">
          <div className="mb-2 flex items-center justify-between"><b className="text-xs">{es ? 'Mapas guardados' : 'Saved maps'}</b><span className="text-[10px] text-[var(--ink-soft)]">{savedPlots.length}</span></div>
          {savedPlots.length === 0 ? <p className="text-[11px] text-[var(--ink-soft)]">{es ? 'Tus mapas guardados aparecerán aquí.' : 'Your saved maps will appear here.'}</p> :
            <div className="space-y-2">{savedPlots.map((plot) => <div key={plot.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] p-2">
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{plot.name}</p><p className="text-[10px] text-[var(--ink-soft)]">{plot.areaM2.toFixed(1)} m² · {plot.points.length} {es ? 'puntos' : 'points'} · {plot.estimatedPlants ?? '—'} {es ? 'plantas estimadas' : 'estimated plants'} · {new Date(plot.updatedAt).toLocaleDateString(es ? 'es-HN' : 'en-US')}</p>{plot.notes && <p className="mt-1 line-clamp-2 text-[10px] text-[var(--ink-soft)]">{plot.notes}</p>}</div>
              <button onClick={() => handleOpenPlot(plot)} className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10px] font-bold">{es ? 'Abrir' : 'Open'}</button>
              <button aria-label={es ? 'Eliminar ' + plot.name : 'Delete ' + plot.name} onClick={() => handleDeletePlot(plot.id)} className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10px] font-bold text-red-600">{es ? 'Borrar' : 'Delete'}</button>
            </div>)}</div>}
        </div>
        <div className="grid grid-cols-2 gap-2"><button disabled={gpsBusy} onClick={capturePoint} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--palm)] px-3 py-3 text-sm font-bold text-white disabled:opacity-50"><MapPin className="h-4 w-4" />{gpsBusy ? (es ? 'Buscando GPS…' : 'Getting GPS…') : (es ? 'Capturar punto' : 'Capture point')}</button><button onClick={() => { setPoints([]); setEditingPlotId(null); setPlotName(''); setPlotNotes(''); }} disabled={!points.length || gpsBusy} className="flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-sm font-bold disabled:opacity-40"><RotateCcw className="h-4 w-4" />{es ? 'Reiniciar' : 'Reset'}</button></div>
        {points.length > 0 && <button onClick={() => setPoints(current => current.slice(0,-1))} className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold">{es ? 'Deshacer último punto' : 'Undo last point'}</button>}
        {points.length > 0 && <ol className="mt-3 space-y-1 text-[11px] text-[var(--ink-soft)]">{points.map((point, index) => <li key={index}>#{index + 1} · {point.lat.toFixed(6)}, {point.lon.toFixed(6)} · ±{point.accuracy.toFixed(0)}m</li>)}</ol>}
        <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-soft)]">{es ? 'Estimación de campo, no un levantamiento topográfico. La precisión depende del dispositivo, cielo abierto y señal GPS. Revisa los límites antes de cotizar o construir.' : 'Field estimate, not a certified survey. Accuracy depends on device, open sky and GPS signal. Verify boundaries before quoting or construction.'}</p>
      </section>}
      {tool === 'materials' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Calculadora de suelo y materiales' : 'Soil & materials calculator'}</h2></div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Calcula volumen para mulch, grava, tierra vegetal o compost. Los adoquines requieren medidas específicas del producto antes de calcular cantidades.' : 'Calculate volume for mulch, gravel, topsoil or compost. Pavers need product-specific dimensions before quantities can be estimated.'}</p>
        <div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3"><p className="text-xs text-[var(--ink-soft)]">{es ? 'Área que se usará' : 'Area being used'}</p><b className="text-2xl">{measuredArea.toFixed(2)} m²</b><p className="text-xs text-[var(--ink-soft)]">{areaSqFt.toFixed(1)} ft² · {areaAcres.toFixed(4)} acres</p></div>
        <div className="mt-4 rounded-2xl border border-[var(--line)] p-3">
          <p className="text-xs font-bold">{es ? 'Material opcional del proyecto' : 'Optional project material'}</p>
          <p className="mt-1 text-[10px] text-[var(--ink-soft)]">{es ? 'Elige solo si este trabajo incluye materiales de superficie o acondicionamiento.' : 'Choose only when this job includes surface or soil-improvement materials.'}</p>
          <label className="mt-3 block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Tipo de material' : 'Material type'}
            <select value={materialType} onChange={e=>{setMaterialType(e.target.value as MaterialType);setSelectedMaterialId('');}} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]">
              <option value="">{es ? 'Ninguno / No aplica' : 'None / Not applicable'}</option>
              {(['mulch','gravel','topsoil','compost','pavers'] as const).map(type=><option key={type} value={type}>{es ? MATERIAL_LABELS[type].es : MATERIAL_LABELS[type].en}</option>)}
            </select>
          </label>
          {materialType && (materialOptions.length > 0 ? <>
            <label className="mt-3 block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Producto disponible en catálogo' : 'Catalog product'}
              <select value={selectedMaterial?.id || ''} onChange={e=>setSelectedMaterialId(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]">
                {materialOptions.map(item=><option key={item.id} value={item.id}>{item.name} · {item.size}</option>)}
              </select>
            </label>
            {selectedMaterial && <div className="mt-2 rounded-xl bg-[var(--surface-2)] p-3 text-xs">
              <b>{selectedMaterial.name}</b><p className="text-[10px] text-[var(--ink-soft)]">{selectedMaterial.size} · {selectedMaterial.nursery}</p>
              {selectedMaterialLiters > 0 ? <div className="mt-2 grid grid-cols-2 gap-2"><div><p className="text-[var(--ink-soft)]">{es ? 'Unidades calculadas' : 'Calculated units'}</p><b className="text-lg">{materialUnitsNeeded}</b></div><div><p className="text-[var(--ink-soft)]">{es ? 'Subtotal estimado' : 'Estimated subtotal'}</p><b>{selectedMaterial.currency} {materialTotal.toFixed(2)}</b></div><div><p className="text-[var(--ink-soft)]">{es ? 'Existencias registradas' : 'Recorded stock'}</p><b>{selectedMaterial.stock_quantity}</b></div></div> : <p className="mt-2 text-[var(--ink-soft)]">{es ? 'El tamaño del paquete no especifica litros o cobertura. No se calculará cantidad ni precio automáticamente.' : 'Package size does not specify liters or coverage. Quantity and price will not be calculated automatically.'}</p>}
              {selectedMaterialLiters > 0 && <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{materialUnitsNeeded > selectedMaterial.stock_quantity ? (es ? 'Supera las existencias registradas; confirma disponibilidad.' : 'Exceeds recorded stock; confirm availability.') : (es ? 'Existencias registradas; confirma antes de comprar.' : 'Recorded stock; confirm before purchase.')}</p>}
            </div>}
          </> : <p className="mt-2 rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]">{es ? 'Este material no aparece actualmente en el catálogo. Puedes calcular el volumen manualmente abajo, pero no se mostrará un precio ni existencias inventadas.' : 'This material is not currently listed in the catalog. You can calculate volume manually below, but no price or stock will be invented.'}</p>)}
        </div>
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
      {tool === 'irrigation' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"><div className="flex items-center gap-2"><Waves className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Planificador básico de riego' : 'Basic irrigation planner'}</h2></div><p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Estimación de emisores según separación aproximada.' : 'Estimate emitter count from approximate spacing.'}</p><label className="mt-4 block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Área por planta (m²)' : 'Area per plant (m²)'}<input type="number" min="0.01" step="0.01" value={coverage} onChange={(event) => setCoverage(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label><div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-4"><p className="text-xs text-[var(--ink-soft)]">{es ? 'Plantas / emisores estimados' : 'Estimated plants / emitters'}</p><b className="text-3xl">{Number.isFinite(irrigationEmitters) ? irrigationEmitters : 0}</b><p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Basado en el área medida o introducida: ' : 'Based on measured or manually entered area: '}{m2.toFixed(1)} m²</p></div><p className="mt-3 text-[10px] text-[var(--ink-soft)]">{es ? 'No sustituye el diseño hidráulico: presión, caudal, pendientes y necesidades de cada especie deben verificarse.' : 'Not a hydraulic design. Verify pressure, flow, slope and species-specific water needs.'}</p></section>}
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] p-3 text-xs text-[var(--ink-soft)]"><Trees className="h-4 w-4 shrink-0 text-[var(--palm)]" />{es ? 'Más herramientas profesionales se añadirán aquí: diseño de jardines, estimación de plantas y planificación de proyectos.' : 'More professional tools will be added here: garden layouts, plant quantities and project planning.'}</div>
    </div>
  );
};
