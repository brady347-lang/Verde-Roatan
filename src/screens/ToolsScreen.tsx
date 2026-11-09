import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { RootWiseDeviceSensors } from '@rootwise/device-sensors';
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Activity, Camera, Calculator, Check, CircleDot, Compass, Leaf, MapPin, Play, RotateCcw, Square, Sun, Trees, Waves } from 'lucide-react';
import { CatalogItem, Language } from '../types';
import { deleteMeasuredPlot, listSavedPlots, saveMeasuredPlot, type SavedPlot } from '../lib/measuredPlotStore';
import { assessLight, recommendPlantsForLight } from '../services/lightIntelligence';
import { classifyGpsError, evaluateFix, hasPreciseLocation, hasSelfIntersection, measurePolygon, type TrackPoint } from '../services/gpsTracking';
import { buildCalibrationProfile, estimateLuxFromCamera, getCameraDeviceKey, loadCalibration, saveCalibration, summarizeFrame, type CameraCalibrationSample, type CalibrationStage } from '../services/cameraLightCalibration';

interface Props { lang: Language; catalog: CatalogItem[]; }
type Point = TrackPoint;
const CAMERA_CALIBRATION_ENABLED = true;
type MaterialType = '' | 'mulch' | 'gravel' | 'topsoil' | 'compost' | 'pavers';
const MATERIAL_LABELS: Record<Exclude<MaterialType, ''>, { en: string; es: string; terms: RegExp }> = {
  mulch: { en: 'Natural mulch', es: 'Mulch natural', terms: /mulch|bark|wood chip|corteza/i },
  gravel: { en: 'Gravel & stone', es: 'Grava y piedra', terms: /gravel|stone|aggregate|crushed rock|grava|piedra/i },
  topsoil: { en: 'Topsoil', es: 'Tierra vegetal', terms: /topsoil|top soil|planting soil|tierra vegetal/i },
  compost: { en: 'Compost & soil blend', es: 'Compost y mezcla de suelo', terms: /compost|soil blend|soil mix|coir|worm cast/i },
  pavers: { en: 'Pavers & stepping stones', es: 'Adoquines y losas', terms: /paver|stepping stone|patio block|adoqu[ií]n|losa/i }
};
function MapViewport({ points, follow }: { points: Point[]; follow: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const latest = points[points.length - 1];
    if (follow) {
      // Keep the walker centered at a useful field zoom instead of repeatedly fitting
      // the ever-growing route (which would zoom farther out as the user walks).
      if (map.getZoom() < 18) map.setZoom(18, { animate: false });
      map.panTo([latest.lat, latest.lon], { animate: true, duration: 0.35 });
      return;
    }
    const bounds = points.map((point) => [point.lat, point.lon] as [number, number]);
    if (bounds.length === 1) map.setView(bounds[0], 18);
    else map.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
  }, [map, points, follow]);
  return null;
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
  const [tracking, setTracking] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState('');
  const gpsWatchRef = useRef<string | number | null>(null);
  const trackingActiveRef = useRef(false);
  const lastAcceptedFixRef = useRef<(TrackPoint & { timestamp?: number }) | null>(null);
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
  const [tool, setTool] = useState<'area' | 'materials' | 'irrigation' | 'light'>('area');
  const [cameraFallbackActive, setCameraFallbackActive] = useState(false);
  const [cameraResponse, setCameraResponse] = useState<number | null>(null);
  const [cameraEstimatedLux, setCameraEstimatedLux] = useState<number | null>(null);
  const cameraEstimateIntervalRef = useRef<number | null>(null);
  const cameraRequestGenerationRef = useRef(0);
  const [liveLux, setLiveLux] = useState<number | null>(null);
  const [sensorStatus, setSensorStatus] = useState('');
  const sensorRef = useRef<{ stop: () => void } | null>(null);
  const sensorTimeoutRef = useRef<number | null>(null);
  const gpsFirstFixTimeoutRef = useRef<number | null>(null);
  const gpsHasFirstFixRef = useRef(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraCalibrationOpen, setCameraCalibrationOpen] = useState(false);
  const [cameraStageIndex, setCameraStageIndex] = useState(0);
  const [cameraSamples, setCameraSamples] = useState<CameraCalibrationSample[]>([]);
  const [cameraReferenceLux, setCameraReferenceLux] = useState('');
  const [cameraStatus, setCameraStatus] = useState('');
  const [cameraProfile, setCameraProfile] = useState(() => typeof navigator !== 'undefined' ? loadCalibration(getCameraDeviceKey(navigator.userAgent)) : null);
  const cameraStages: Array<{ stage: CalibrationStage; title: string; instruction: string; esTitle: string; esInstruction: string }> = [
    { stage: 'dark', title: 'Complete darkness', instruction: 'Cover the rear camera lens completely for 8 seconds. Keep the phone still.', esTitle: 'Oscuridad completa', esInstruction: 'Cubre completamente la cámara trasera durante 8 segundos. Mantén el teléfono quieto.' },
    { stage: 'shade', title: 'Open shade', instruction: 'Uncover the camera and point it at a consistently shaded, evenly lit surface.', esTitle: 'Sombra abierta', esInstruction: 'Destapa la cámara y apunta a una superficie uniformemente iluminada por sombra.' },
    { stage: 'indirect', title: 'Bright indirect daylight', instruction: 'Point at a bright surface near daylight, but keep direct sunlight out of the lens.', esTitle: 'Luz diurna indirecta', esInstruction: 'Apunta a una superficie luminosa cerca de la luz natural, sin sol directo en la lente.' },
    { stage: 'bright', title: 'Bright daylight', instruction: 'Point at a bright ground or wall surface. Never point the camera directly at the sun.', esTitle: 'Luz diurna intensa', esInstruction: 'Apunta a una pared o superficie brillante. Nunca apuntes directamente al sol.' }
  ];
  const stopCameraCalibration = () => {
    cameraRequestGenerationRef.current += 1;
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  };
  const stopCameraFallback = () => {
    cameraRequestGenerationRef.current += 1;
    if (cameraEstimateIntervalRef.current !== null) window.clearInterval(cameraEstimateIntervalRef.current);
    cameraEstimateIntervalRef.current = null;
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setCameraFallbackActive(false);
    setCameraCalibrationOpen(false);
    setCameraResponse(null);
    setCameraEstimatedLux(null);
  };
  const startCameraFallback = async () => {
    stopCameraFallback();
    const requestGeneration = ++cameraRequestGenerationRef.current;
    sensorRef.current?.stop();
    sensorRef.current = null;
    if (sensorTimeoutRef.current) window.clearTimeout(sensorTimeoutRef.current);
    sensorTimeoutRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_UNAVAILABLE');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }
    });
    if (requestGeneration !== cameraRequestGenerationRef.current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const video = cameraVideoRef.current;
    if (!video) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('CAMERA_PREVIEW_UNAVAILABLE');
    }
    cameraStreamRef.current = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      video.srcObject = null;
      throw error;
    }
    if (requestGeneration !== cameraRequestGenerationRef.current) {
      stream.getTracks().forEach(track => track.stop());
      if (cameraStreamRef.current === stream) cameraStreamRef.current = null;
      if (video.srcObject === stream) video.srcObject = null;
      return;
    }
    setCameraCalibrationOpen(false);
    setCameraFallbackActive(true);
    setLiveLux(null);
    setCameraResponse(null);
    setCameraEstimatedLux(null);
    setSensorStatus(es
      ? 'Cámara activa. Se muestra brillo relativo; calibra con un luxómetro profesional para obtener lux.'
      : 'Camera active. Showing relative brightness; calibrate with a professional lux meter to estimate lux.');
    cameraEstimateIntervalRef.current = window.setInterval(() => {
      const currentVideo = cameraVideoRef.current;
      const canvas = cameraCanvasRef.current;
      if (!currentVideo || !canvas || currentVideo.readyState < 2) return;
      canvas.width = 160;
      canvas.height = 120;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(currentVideo, 0, 0, canvas.width, canvas.height);
      const response = summarizeFrame(context.getImageData(0, 0, canvas.width, canvas.height).data);
      setCameraResponse(response);
      const estimate = cameraProfile ? estimateLuxFromCamera(response, cameraProfile) : null;
      setCameraEstimatedLux(estimate?.lux ?? null);
      setSensorStatus(estimate
        ? (es ? 'Cámara activa · lux estimados con el perfil calibrado de este teléfono.' : 'Camera active · lux estimated with this phone’s calibrated profile.')
        : (es ? 'Cámara activa · brillo relativo solamente. Añade lecturas profesionales en Calibración para estimar lux.' : 'Camera active · relative brightness only. Add professional readings in Calibration to estimate lux.'));
    }, 1000);
  };
  const startCameraCalibration = async () => {
    stopCameraFallback();
    const requestGeneration = ++cameraRequestGenerationRef.current;
    sensorRef.current?.stop();
    sensorRef.current = null;
    if (sensorTimeoutRef.current) window.clearTimeout(sensorTimeoutRef.current);
    sensorTimeoutRef.current = null;
    setLiveLux(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus(es ? 'La cámara requiere un navegador seguro compatible.' : 'Camera access requires a supported secure browser context.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } } });
      if (requestGeneration !== cameraRequestGenerationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      setCameraCalibrationOpen(true);
      setCameraStageIndex(0);
      setCameraSamples([]);
      setCameraReferenceLux('');
      setCameraStatus(es ? 'Cámara lista. Sigue cada paso.' : 'Camera ready. Follow each step.');
      window.setTimeout(() => {
        if (requestGeneration !== cameraRequestGenerationRef.current) return;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          void cameraVideoRef.current.play().catch(() => undefined);
        }
      }, 0);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      setCameraStatus(name === 'NotAllowedError' || name === 'SecurityError'
        ? (es ? 'El permiso de cámara está denegado. Actívalo en Ajustes de Android → Aplicaciones → Rootwise → Permisos → Cámara e inténtalo de nuevo.' : 'Camera permission is denied. Enable it in Android Settings → Apps → Rootwise → Permissions → Camera, then try again.')
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? (es ? 'No se encontró una cámara trasera utilizable en este dispositivo.' : 'No usable rear camera was found on this device.')
          : name === 'NotReadableError'
            ? (es ? 'La cámara está en uso por otra aplicación. Ciérrala e inténtalo de nuevo.' : 'The camera is in use by another app. Close it and try again.')
            : (es ? 'No se pudo acceder a la cámara. Revisa el permiso e inténtalo de nuevo.' : 'Camera access failed. Check permission and try again.'));
    }
  };
  const captureCameraCalibrationStage = () => {
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      setCameraStatus(es ? 'Espera a que la vista de cámara esté lista.' : 'Wait for the camera preview to become ready.');
      return;
    }
    canvas.width = 160; canvas.height = 120;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const response = summarizeFrame(context.getImageData(0, 0, canvas.width, canvas.height).data);
    const stage = cameraStages[cameraStageIndex].stage;
    const referenceLux = cameraReferenceLux.trim() ? Number(cameraReferenceLux) : undefined;
    if (referenceLux !== undefined && (!Number.isFinite(referenceLux) || referenceLux < 0)) {
      setCameraStatus(es ? 'Introduce un valor de lux válido o deja el campo vacío.' : 'Enter a valid lux value or leave the field blank.');
      return;
    }
    const next = [...cameraSamples.filter(sample => sample.stage !== stage), { stage, response, referenceLux, capturedAt: new Date().toISOString() }];
    setCameraSamples(next);
    setCameraReferenceLux('');
    if (cameraStageIndex < cameraStages.length - 1) setCameraStageIndex(index => index + 1);
    else {
      try {
        const profile = buildCalibrationProfile(getCameraDeviceKey(navigator.userAgent), next);
        saveCalibration(profile);
        setCameraProfile(profile);
        setCameraStatus(profile.quality === 'reference_calibrated'
          ? (es ? 'Perfil calibrado guardado en este dispositivo.' : 'Reference-calibrated profile saved on this device.')
          : (es ? 'Perfil relativo guardado. Añade al menos tres lecturas de un luxómetro para convertir la respuesta en lux.' : 'Relative profile saved. Add at least three readings from a lux meter to estimate lux.'));
        stopCameraCalibration();
        setCameraCalibrationOpen(false);
      } catch (error) {
        setCameraStatus(error instanceof Error ? error.message : (es ? 'No se pudo validar la calibración.' : 'Calibration could not be validated.'));
      }
    }
  };
  const lux = liveLux ?? cameraEstimatedLux ?? 0;
  const hasMeasuredLux = liveLux !== null || cameraEstimatedLux !== null;
  const lightAssessment = useMemo(() => assessLight(lux), [lux]);
  const lightMatches = useMemo(() => recommendPlantsForLight(lux), [lux]);
  const stopGpsTracking = async () => {
    trackingActiveRef.current = false;
    if (gpsFirstFixTimeoutRef.current !== null) window.clearTimeout(gpsFirstFixTimeoutRef.current);
    gpsFirstFixTimeoutRef.current = null;
    gpsHasFirstFixRef.current = false;
    setTracking(false);
    if (gpsWatchRef.current !== null) {
      if (typeof gpsWatchRef.current === 'string') await Geolocation.clearWatch({ id: gpsWatchRef.current }).catch(() => undefined);
      else if (typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
    setTrackingStatus(es ? 'Seguimiento detenido. El recorrido queda en el mapa.' : 'Tracking stopped. Your path remains on the map.');
  };
  useEffect(() => () => {
    trackingActiveRef.current = false;
    if (gpsFirstFixTimeoutRef.current !== null) window.clearTimeout(gpsFirstFixTimeoutRef.current);
    gpsFirstFixTimeoutRef.current = null;
    cameraRequestGenerationRef.current += 1;
    if (gpsWatchRef.current !== null) {
      if (typeof gpsWatchRef.current === 'string') void Geolocation.clearWatch({ id: gpsWatchRef.current });
      else if (typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchRef.current);
    }
    sensorRef.current?.stop();
    if (sensorTimeoutRef.current) window.clearTimeout(sensorTimeoutRef.current);
    if (cameraEstimateIntervalRef.current !== null) window.clearInterval(cameraEstimateIntervalRef.current);
    stopCameraCalibration();
  }, []);
  useEffect(() => { if (tool !== 'area' && trackingActiveRef.current) void stopGpsTracking(); }, [tool]);
  useEffect(() => { if (tool !== 'light') { if (sensorRef.current) { sensorRef.current.stop(); sensorRef.current = null; setLiveLux(null); } stopCameraFallback(); } }, [tool]);
  const startLightSensor = async () => {
    stopCameraFallback();
    sensorRef.current?.stop();
    sensorRef.current = null;
    if (sensorTimeoutRef.current) window.clearTimeout(sensorTimeoutRef.current);
    setLiveLux(null);
    setSensorStatus(es ? 'Esperando la primera lectura del sensor…' : 'Waiting for the first sensor reading…');
    try {
      if (Capacitor.isNativePlatform()) {
        let receivedReading = false;
        const listener = await RootWiseDeviceSensors.addListener('lightReading', (event) => {
          if (!Number.isFinite(event.lux)) return;
          receivedReading = true;
          if (sensorTimeoutRef.current) window.clearTimeout(sensorTimeoutRef.current);
          setLiveLux(Math.max(0, event.lux));
          setSensorStatus(es ? 'Sensor Android activo · lectura en vivo.' : 'Android sensor active · live reading received.');
        });
        const errorListener = await RootWiseDeviceSensors.addListener('lightSensorError', () => {
          // The native layer could not re-register the sensor after the app resumed. Drop the stale
          // Switch to the rear camera when the native sensor becomes unavailable.
          if (sensorTimeoutRef.current) window.clearTimeout(sensorTimeoutRef.current);
          setLiveLux(null);
          void startCameraFallback().catch(() => setSensorStatus(es ? 'El sensor no pudo reanudarse y la cámara tampoco está disponible. Revisa el permiso de cámara.' : 'The sensor could not resume and the camera is unavailable. Check camera permission.'));
        });
        try {
          await RootWiseDeviceSensors.startAmbientLight();
        } catch (error) {
          await listener.remove();
          await errorListener.remove();
          throw error;
        }
        sensorRef.current = { stop: () => {
          void RootWiseDeviceSensors.stopAmbientLight();
          void listener.remove();
          void errorListener.remove();
        } };
        sensorTimeoutRef.current = window.setTimeout(() => {
          if (!receivedReading) void startCameraFallback().catch(() => setSensorStatus(es ? 'No hay lectura del sensor y no se pudo abrir la cámara. Revisa el permiso de cámara.' : 'No sensor reading arrived and the camera could not start. Check camera permission.'));
        }, 6000);
        return;
      }

      type SensorLike = { illuminance?: number; start: () => void; stop: () => void; addEventListener: (name: string, callback: () => void) => void; onerror: ((event: unknown) => void) | null };
      const Sensor = (window as unknown as { AmbientLightSensor?: new (options?: { frequency?: number }) => SensorLike }).AmbientLightSensor;
      if (!Sensor) throw new Error('AMBIENT_LIGHT_SENSOR_UNAVAILABLE');
      const sensor = new Sensor({ frequency: 1 });
      let receivedReading = false;
      sensor.addEventListener('reading', () => {
        if (typeof sensor.illuminance === 'number' && Number.isFinite(sensor.illuminance)) {
          receivedReading = true;
          if (sensorTimeoutRef.current) window.clearTimeout(sensorTimeoutRef.current);
          setLiveLux(sensor.illuminance);
          setSensorStatus(es ? 'Sensor del navegador activo · lectura en vivo.' : 'Browser sensor active · live reading received.');
        }
      });
      sensor.onerror = () => { void startCameraFallback().catch(() => setSensorStatus(es ? 'Falló el sensor y no se pudo abrir la cámara.' : 'Sensor failed and the camera could not start.')); };
      sensor.start();
      sensorRef.current = sensor;
      sensorTimeoutRef.current = window.setTimeout(() => {
        if (!receivedReading) void startCameraFallback().catch(() => setSensorStatus(es ? 'El sensor no respondió y no se pudo abrir la cámara.' : 'The sensor did not respond and the camera could not start.'));
      }, 6000);
    } catch {
      try { await startCameraFallback(); }
      catch (cameraError) {
        const detail = cameraError instanceof Error ? cameraError.message : '';
        setSensorStatus(es
          ? (/NotAllowed|denied|permission/i.test(detail) ? 'El permiso de cámara está denegado. Actívalo en Ajustes → Aplicaciones → Rootwise → Permisos → Cámara.' : 'No se pudo iniciar el sensor ni la cámara. Comprueba los permisos y vuelve a intentarlo.')
          : (/NotAllowed|denied|permission/i.test(detail) ? 'Camera permission is denied. Enable it in Settings → Apps → Rootwise → Permissions → Camera.' : 'Neither the light sensor nor camera could start. Check permissions and try again.'));
      }
    }
  };
  const stopLightSensor = () => {
    sensorRef.current?.stop();
    sensorRef.current = null;
    if (sensorTimeoutRef.current) window.clearTimeout(sensorTimeoutRef.current);
    sensorTimeoutRef.current = null;
    stopCameraFallback();
    setLiveLux(null);
    setSensorStatus(es ? 'Sensor detenido.' : 'Sensor stopped.');
  };
  const openPhoneLocationSettings = async () => {
    try {
      await RootWiseDeviceSensors.openLocationSettings();
    } catch {
      setGpsError(es ? 'No se pudieron abrir los ajustes de ubicación. Abre Ajustes del teléfono → Ubicación.' : 'Could not open Location settings. Open your phone Settings → Location.');
    }
  };
  const measurement = useMemo(() => measurePolygon(points), [points]);
  const selfCrossing = useMemo(() => hasSelfIntersection(points), [points]);
  const sodOptions = useMemo(() => catalog.filter((item) => item.kind === 'grass' && /sod|zoysia|natural grass/i.test([item.name, item.sci, item.category, ...item.tags].join(' ')) && !/artificial|synthetic/i.test([item.name, item.category, ...item.tags].join(' '))), [catalog]);
  const selectedSod = sodOptions.find((item) => item.id === selectedSodId);
  const materialOptions = useMemo(() => materialType ? catalog.filter((item) => MATERIAL_LABELS[materialType].terms.test([item.name, item.sci, item.category, ...item.tags].join(' ')) && !/artificial|synthetic/i.test([item.name, item.category, ...item.tags].join(' '))) : [], [catalog, materialType]);
  const selectedMaterial = materialOptions.find((item) => item.id === selectedMaterialId) || materialOptions[0];
  const gpsErrorText = (kind: ReturnType<typeof classifyGpsError>, raw = '') => {
    switch (kind) {
      case 'permission_denied':
        return es ? 'El permiso de ubicación está denegado. Actívalo en Ajustes de Android → Aplicaciones → Rootwise → Permisos → Ubicación.' : 'Location permission is denied. Enable it in Android Settings → Apps → Rootwise → Permissions → Location.';
      case 'precise_required':
        return es ? 'RootWise necesita ubicación precisa para trazar el borde. En Ajustes de Android → Aplicaciones → Rootwise → Permisos → Ubicación, activa «Usar ubicación precisa».' : 'RootWise needs Precise location to trace a boundary. In Android Settings → Apps → Rootwise → Permissions → Location, turn on “Use precise location”.';
      case 'services_disabled':
        return es ? 'La ubicación del teléfono está desactivada. Actívala y toca «Iniciar recorrido» de nuevo.' : 'Phone Location is turned off. Turn it on, then tap Start walk again.';
      case 'timeout':
        return es ? 'El GPS no obtuvo una posición. Muévete a cielo abierto e inténtalo de nuevo.' : 'GPS could not get a fix. Move to open sky and try again.';
      case 'unavailable':
        return es ? 'La posición GPS no está disponible ahora. Muévete a cielo abierto e inténtalo de nuevo.' : 'GPS position is unavailable right now. Move to open sky and try again.';
      default:
        return raw || (es ? 'Se perdió la señal GPS.' : 'GPS signal was lost.');
    }
  };
  const reportGpsError = (raw: string | undefined) => {
    if (gpsFirstFixTimeoutRef.current !== null) window.clearTimeout(gpsFirstFixTimeoutRef.current);
    gpsFirstFixTimeoutRef.current = null;
    const kind = classifyGpsError(raw);
    setGpsError(gpsErrorText(kind, raw));
  };
  const appendTrackedPoint = (latitude: number, longitude: number, accuracy: number, timestamp?: number) => {
    gpsHasFirstFixRef.current = true;
    if (gpsFirstFixTimeoutRef.current !== null) window.clearTimeout(gpsFirstFixTimeoutRef.current);
    gpsFirstFixTimeoutRef.current = null;
    setGpsError('');
    const decision = evaluateFix(lastAcceptedFixRef.current ?? undefined, { lat: latitude, lon: longitude, accuracy, timestamp });
    if (decision.accept === false) {
      if (decision.reason === 'inaccurate') setTrackingStatus(es ? 'Esperando una señal GPS más precisa…' : 'Waiting for a more accurate GPS fix…');
      else if (decision.reason === 'jump') setTrackingStatus(es ? 'Se ignoró un salto brusco del GPS.' : 'Ignored a sudden GPS jump.');
      return;
    }
    lastAcceptedFixRef.current = { lat: latitude, lon: longitude, accuracy, timestamp };
    setPoints((current) => [...current, { lat: latitude, lon: longitude, accuracy }]);
    setTrackingStatus(es ? `Seguimiento en vivo · precisión ±${Math.round(accuracy)} m` : `Live tracking · ±${Math.round(accuracy)} m accuracy`);
  };
  const startGpsTracking = async () => {
    if (trackingActiveRef.current) return;
    setGpsBusy(true);
    setGpsError('');
    gpsHasFirstFixRef.current = false;
    if (gpsFirstFixTimeoutRef.current !== null) window.clearTimeout(gpsFirstFixTimeoutRef.current);
    gpsFirstFixTimeoutRef.current = null;
    setTrackingStatus(es ? 'Iniciando GPS…' : 'Starting GPS…');
    const lastPoint = points[points.length - 1];
    lastAcceptedFixRef.current = lastPoint ? { ...lastPoint } : null;
    try {
      const options = { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 };
      if (Capacitor.isNativePlatform()) {
        let permission = await Geolocation.checkPermissions();
        if (!hasPreciseLocation(permission)) permission = await Geolocation.requestPermissions();
        if (!hasPreciseLocation(permission)) throw new Error(permission.coarseLocation === 'granted' ? 'LOCATION_PRECISE_REQUIRED' : 'LOCATION_PERMISSION_DENIED');
        trackingActiveRef.current = true;
        const watchId = await Geolocation.watchPosition(options, (position, error) => {
          if (!trackingActiveRef.current) return;
          if (error) {
            reportGpsError(error.message);
            return;
          }
          if (position) appendTrackedPoint(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp);
        });
        if (!trackingActiveRef.current) {
          // Stopped (or the screen closed) while the native watcher was still starting: release it and
          // do not flip the UI back into the tracking state.
          await Geolocation.clearWatch({ id: watchId }).catch(() => undefined);
          return;
        }
        gpsWatchRef.current = watchId;
      } else {
        if (!navigator.geolocation) throw new Error('GEOLOCATION_UNAVAILABLE');
        if (!window.isSecureContext) throw new Error('GEOLOCATION_REQUIRES_HTTPS');
        trackingActiveRef.current = true;
        gpsWatchRef.current = navigator.geolocation.watchPosition(
          (position) => { if (trackingActiveRef.current) appendTrackedPoint(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp); },
          (error) => { if (trackingActiveRef.current) reportGpsError(error.code === 1 ? 'LOCATION_PERMISSION_DENIED' : error.message); },
          options
        );
      }
      setTracking(true);
      if (gpsHasFirstFixRef.current) {
        setTrackingStatus(es ? 'Seguimiento GPS en vivo · el mapa se actualiza al caminar.' : 'Live GPS tracking · the map updates as you walk.');
      } else {
        setTrackingStatus(es ? 'GPS conectado · esperando la primera ubicación…' : 'GPS connected · waiting for the first location…');
        gpsFirstFixTimeoutRef.current = window.setTimeout(() => {
          if (!trackingActiveRef.current || gpsHasFirstFixRef.current) return;
          setTrackingStatus(es ? 'GPS sigue buscando señal. Mantén RootWise abierto, activa Ubicación precisa y prueba al aire libre.' : 'GPS is still waiting for a fix. Keep RootWise open, enable Precise location and try outdoors.');
          setGpsError(es ? 'Todavía no se recibió una posición GPS. Comprueba Ubicación y vuelve a intentarlo en un espacio abierto.' : 'No GPS position has arrived yet. Check Location and try again in an open area.');
        }, 25000);
      }
    } catch (error) {
      trackingActiveRef.current = false;
      if (gpsFirstFixTimeoutRef.current !== null) window.clearTimeout(gpsFirstFixTimeoutRef.current);
      gpsFirstFixTimeoutRef.current = null;
      const message = error instanceof Error ? error.message : '';
      if (message === 'GEOLOCATION_REQUIRES_HTTPS') {
        setGpsError(es ? 'La ubicación del navegador requiere HTTPS.' : 'Browser location requires HTTPS.');
      } else if (message === 'GEOLOCATION_UNAVAILABLE') {
        setGpsError(es ? 'Este navegador no ofrece geolocalización.' : 'This browser does not provide geolocation.');
      } else {
        const kind = classifyGpsError(message);
        setGpsError(kind === 'unknown'
          ? (es ? 'No se pudo iniciar el seguimiento GPS. Comprueba los permisos y la ubicación del teléfono.' : 'Could not start GPS tracking. Check app permission and phone Location settings.')
          : gpsErrorText(kind, message));
      }
      setTrackingStatus('');
    } finally { setGpsBusy(false); }
  };
  const capturePoint = async () => {
    setGpsBusy(true);
    setGpsError('');
    try {
      let latitude: number;
      let longitude: number;
      let accuracy: number;
      if (Capacitor.isNativePlatform()) {
        let permission = await Geolocation.checkPermissions();
        if (!hasPreciseLocation(permission)) permission = await Geolocation.requestPermissions();
        if (!hasPreciseLocation(permission)) throw new Error(permission.coarseLocation === 'granted' ? 'LOCATION_PRECISE_REQUIRED' : 'LOCATION_PERMISSION_DENIED');
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
        latitude = position.coords.latitude; longitude = position.coords.longitude; accuracy = position.coords.accuracy;
      } else {
        if (!navigator.geolocation) throw new Error('GEOLOCATION_UNAVAILABLE');
        if (!window.isSecureContext) throw new Error('GEOLOCATION_REQUIRES_HTTPS');
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }));
        latitude = position.coords.latitude; longitude = position.coords.longitude; accuracy = position.coords.accuracy;
      }
      const previousPoint = points[points.length - 1];
      const decision = evaluateFix(previousPoint, { lat: latitude, lon: longitude, accuracy, timestamp: Date.now() });
      if (decision.accept === false) {
        setGpsError(decision.reason === 'inaccurate'
          ? (es ? 'La precisión GPS es demasiado baja para añadir este punto (se requiere ±30 m o mejor). Inténtalo al aire libre.' : 'GPS accuracy is too low to add this point (±30 m or better is required). Try again outdoors.')
          : decision.reason === 'duplicate'
            ? (es ? 'Este punto está demasiado cerca del último punto capturado.' : 'This point is too close to the last captured point.')
            : (es ? 'La ubicación recibida no es válida. Inténtalo de nuevo.' : 'The location fix is invalid. Please try again.'));
        return;
      }
      setPoints((current) => [...current, { lat: latitude, lon: longitude, accuracy }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = typeof error === 'object' && error !== null && 'code' in error ? Number((error as { code?: unknown }).code) : 0;
      if (message === 'LOCATION_PRECISE_REQUIRED') { setGpsError(gpsErrorText('precise_required')); return; }
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
  const sodCoverageM2 = Number(selectedSod?.material_spec?.coverage_area_m2) || 0;
  const sodUnitsNeeded = sodCoverageM2 > 0 ? Math.ceil(measuredArea / sodCoverageM2) : 0;
  const sodTotal = selectedSod && sodUnitsNeeded > 0 ? sodUnitsNeeded * selectedSod.price : 0;
  const sodAvailable = selectedSod ? Math.max(0, selectedSod.stock_quantity || 0) : 0;
  const sodUnitLabel = selectedSod?.material_spec?.unit_label || (es ? 'unidades' : 'units');
  const m2 = measuredArea;
  const safeDepth = Math.max(0, Number(depth) || 0);
  const safeWaste = Math.max(0, Number(waste) || 0);
  const volume = measuredArea * safeDepth * (1 + safeWaste / 100);
  const bags = Number(bagLiters) > 0 ? Math.ceil(volume * 1000 / Number(bagLiters)) : 0;
  const selectedMaterialLiters = Number(selectedMaterial?.material_spec?.package_volume_liters) || 0;
  const selectedMaterialCoverage = Number(selectedMaterial?.material_spec?.coverage_area_m2) || 0;
  const materialUnitsNeeded = materialType === 'pavers'
    ? selectedMaterialCoverage > 0 ? Math.ceil(measuredArea / selectedMaterialCoverage) : 0
    : selectedMaterialLiters > 0 ? Math.ceil(volume * 1000 / selectedMaterialLiters) : 0;
  const materialUnitLabel = selectedMaterial?.material_spec?.unit_label || (es ? 'unidades' : 'units');
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
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Inicia el seguimiento y camina por todo el perímetro. RootWise seguirá tu recorrido GPS y actualizará el mapa y el área en vivo.' : 'Start tracking and walk the full boundary. RootWise follows your GPS path and updates the map and area live.'}</p>
        <div className="my-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-2xl tabular-nums">{points.length}</b><p className="text-xs text-[var(--ink-soft)]">{es ? 'Puntos capturados' : 'Points captured'}</p></div>
          <div className="rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-2xl tabular-nums">{points.length >= 3 ? (area >= 10000 ? (area / 10000).toFixed(3) : area.toFixed(1)) : manualArea.toFixed(1)}</b><p className="text-xs text-[var(--ink-soft)]">{points.length >= 3 && area >= 10000 ? 'ha' : 'm²'} {es ? 'área estimada' : 'estimated area'}</p></div>
        </div>
        {points.length > 0 && <div className="mb-3 rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]"><p>{es ? 'Perímetro estimado' : 'Estimated perimeter'}: <b className="text-[var(--ink)]">{measurement.perimeter.toFixed(1)} m</b></p><p>{es ? 'Precisión GPS promedio' : 'Average GPS accuracy'}: <b className="text-[var(--ink)]">{(points.reduce((sum, point) => sum + point.accuracy, 0) / points.length).toFixed(1)} m</b></p></div>}
        {points.length > 0 && <div className="mb-3 overflow-hidden rounded-2xl border border-[var(--line)]">
          <div className="flex items-center justify-between bg-[var(--surface-2)] px-3 py-2"><b className="text-xs">{es ? "Mapa del terreno medido" : "Measured land map"}</b><span className="text-[10px] text-[var(--ink-soft)]">{points.length >= 3 ? (es ? "Perímetro trazado" : "Boundary plotted") : (es ? "Puntos GPS" : "GPS points")}</span></div>
          <MapContainer center={[points[0].lat, points[0].lon]} zoom={18} scrollWheelZoom={false} style={{ height: "280px", width: "100%" }}>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapViewport points={points} follow={tracking} />
            {(tracking || points.length < 3) && points.length >= 2 && <Polyline positions={points.map((point) => [point.lat, point.lon] as [number, number])} pathOptions={{ color: "#16845B", weight: 4 }} />}
            {!tracking && points.length >= 3 && <Polygon positions={points.map((point) => [point.lat, point.lon] as [number, number])} pathOptions={{ color: "#16845B", weight: 3, fillColor: "#39A879", fillOpacity: 0.28 }} />}
            {points.length > 0 && <CircleMarker center={[points[points.length - 1].lat, points[points.length - 1].lon]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0b8f62', fillOpacity: 1 }} />}
            {points.map((point, index) => <CircleMarker key={index} center={[point.lat, point.lon]} radius={7} pathOptions={{ color: "#FFFFFF", weight: 2, fillColor: "#126B4B", fillOpacity: 1 }} />)}
          </MapContainer>
          {points.length < 3 && <p className="bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">{es ? "Captura al menos 3 esquinas para cerrar y calcular el área del polígono." : "Capture at least 3 corners to close the boundary and calculate its area."}</p>}
          {!tracking && selfCrossing && <p role="alert" className="bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">{es ? 'El recorrido se cruza a sí mismo, así que el área mostrada no es fiable. Deshaz los últimos puntos o reinicia y camina el borde sin cruzarlo.' : 'The walked path crosses itself, so the area shown is not reliable. Undo the last points, or reset and walk the boundary without crossing it.'}</p>}
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
                <option value="">{es ? 'Ninguno / No usar césped natural' : 'None / No natural sod'}</option>
                {sodOptions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.size}</option>)}
              </select>
            </label>
            {selectedSod && <div className="mt-3 rounded-xl bg-[var(--surface-2)] p-3">
              <div className="flex items-start justify-between gap-2"><div><b className="text-sm">{selectedSod.name}</b><p className="text-[10px] text-[var(--ink-soft)]">{selectedSod.size} · {selectedSod.nursery}</p></div><span className="rounded-full bg-[var(--palm)]/15 px-2 py-1 text-[10px] font-bold text-[var(--palm)]">{selectedSod.stock_quantity > 0 && selectedSod.stock !== 'Out of stock' ? (es ? 'En catálogo' : 'In catalog') : (es ? 'Sin existencias' : 'Out of stock')}</span></div>
              {sodCoverageM2 > 0 ? <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-[var(--ink-soft)]">{es ? 'Cantidad necesaria' : 'Quantity needed'}</p><b className="text-xl">{sodUnitsNeeded} {sodUnitLabel}</b></div>
                  <div><p className="text-[var(--ink-soft)]">{es ? 'Existencias registradas' : 'Recorded stock'}</p><b className="text-xl">{sodAvailable}</b></div>
                  <div><p className="text-[var(--ink-soft)]">{es ? 'Precio por unidad' : 'Price per unit'}</p><b>{selectedSod.currency} {selectedSod.price.toFixed(2)}</b></div>
                  <div><p className="text-[var(--ink-soft)]">{es ? 'Subtotal estimado' : 'Estimated subtotal'}</p><b>{selectedSod.currency} {sodTotal.toFixed(2)}</b></div>
                </div>
                <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{sodUnitsNeeded > sodAvailable ? (es ? 'La cantidad calculada supera las existencias registradas. Contacta al vivero para confirmar disponibilidad o solicitar abastecimiento.' : 'Calculated quantity exceeds recorded stock. Contact the nursery to confirm availability or request sourcing.') : (es ? 'Existencias suficientes según el registro actual; confirma antes de comprar.' : 'Recorded stock appears sufficient; confirm availability before purchase.')}</p>
              </> : <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{es ? 'Este producto no tiene cobertura por unidad verificada. Se muestra en el catálogo, pero no se calculará cantidad ni precio estimado.' : 'This product has no verified coverage per unit. It is listed in the catalog, but quantity and estimated price will not be calculated.'}</p>}
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
        {gpsError && <div role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700"><p>{gpsError}</p>{Capacitor.isNativePlatform() && <div className="mt-3 grid grid-cols-1 gap-2"><button type="button" onClick={capturePoint} disabled={gpsBusy} className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 font-bold text-red-700 disabled:opacity-50">{gpsBusy ? (es ? 'Solicitando permiso…' : 'Requesting permission…') : (es ? 'Volver a solicitar permiso de ubicación' : 'Request location permission again')}</button><button type="button" onClick={openPhoneLocationSettings} className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-bold text-[var(--ink)]">{es ? 'Activar ubicación del teléfono' : 'Turn on phone Location Services'}</button></div>}</div>}
        {plotStorageError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{plotStorageError}</p>}
        {points.length >= 3 && <div className="mb-3 rounded-2xl border border-[var(--line)] p-3">
          <p className="mb-2 text-xs font-bold">{es ? 'Guardar este mapa en el dispositivo' : 'Save this map on this device'}</p>
          <input aria-label={es ? 'Nombre del terreno' : 'Plot name'} value={plotName} onChange={(event) => setPlotName(event.target.value)} placeholder={es ? 'Nombre del terreno (opcional)' : 'Plot name (optional)'} className="mb-2 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          <label className="mb-2 block text-xs text-[var(--ink-soft)]">{es ? 'Notas del sitio (suelo, sombra, pendientes, obstáculos...)' : 'Site notes (soil, shade, slope, obstacles...)'}
            <textarea value={plotNotes} onChange={(event) => setPlotNotes(event.target.value)} rows={3} maxLength={1200} placeholder={es ? 'Añade detalles útiles para el proyecto...' : 'Add useful project details...'} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          </label>
          <button disabled={tracking} onClick={handleSavePlot} className="w-full disabled:opacity-40 rounded-xl bg-[var(--palm)] px-3 py-2 text-xs font-bold text-white">{editingPlotId ? (es ? 'Actualizar terreno' : 'Update plot') : (es ? 'Guardar mapa' : 'Save map')}</button>
          <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{es ? 'Las coordenadas se guardan solo en este dispositivo; no se suben a la nube.' : 'Coordinates are stored only on this device; they are not uploaded to the cloud.'}</p>
        </div>}
        <div className="mb-3 rounded-2xl border border-[var(--line)] p-3">
          <div className="mb-2 flex items-center justify-between"><b className="text-xs">{es ? 'Mapas guardados' : 'Saved maps'}</b><span className="text-[10px] text-[var(--ink-soft)]">{savedPlots.length}</span></div>
          {savedPlots.length === 0 ? <p className="text-[11px] text-[var(--ink-soft)]">{es ? 'Tus mapas guardados aparecerán aquí.' : 'Your saved maps will appear here.'}</p> :
            <div className="space-y-2">{savedPlots.map((plot) => <div key={plot.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] p-2">
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{plot.name}</p><p className="text-[10px] text-[var(--ink-soft)]">{plot.areaM2.toFixed(1)} m² · {plot.points.length} {es ? 'puntos' : 'points'} · {plot.estimatedPlants ?? '—'} {es ? 'plantas estimadas' : 'estimated plants'} · {new Date(plot.updatedAt).toLocaleDateString(es ? 'es-HN' : 'en-US')}</p>{(plot.surfaceMaterialName || plot.projectMaterialName) && <p className="mt-1 line-clamp-2 text-[10px] text-[var(--ink-soft)]">{[plot.surfaceMaterialName, plot.projectMaterialName].filter(Boolean).join(' · ')}</p>}{plot.notes && <p className="mt-1 line-clamp-2 text-[10px] text-[var(--ink-soft)]">{plot.notes}</p>}</div>
              <button onClick={() => handleOpenPlot(plot)} className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10px] font-bold">{es ? 'Abrir' : 'Open'}</button>
              <button aria-label={es ? 'Eliminar ' + plot.name : 'Delete ' + plot.name} onClick={() => handleDeletePlot(plot.id)} className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10px] font-bold text-red-600">{es ? 'Borrar' : 'Delete'}</button>
            </div>)}</div>}
        </div>
        <div className="grid grid-cols-2 gap-2"><button disabled={gpsBusy || tracking} onClick={startGpsTracking} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--palm)] px-3 py-3 text-sm font-bold text-white disabled:opacity-50"><Play className="h-4 w-4" />{gpsBusy ? (es ? 'Iniciando…' : 'Starting…') : (es ? 'Iniciar recorrido' : 'Start walk')}</button><button disabled={!tracking} onClick={() => void stopGpsTracking()} className="flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-sm font-bold disabled:opacity-40"><Square className="h-4 w-4" />{es ? 'Detener recorrido' : 'Stop walk'}</button></div>
        {trackingStatus && <p role="status" className="mt-2 rounded-xl bg-[var(--surface-2)] p-2 text-xs text-[var(--ink-soft)]">{trackingStatus}</p>}
        <div className="mt-2 grid grid-cols-2 gap-2"><button disabled={gpsBusy || tracking} onClick={capturePoint} className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold disabled:opacity-40"><MapPin className="mr-1 inline h-4 w-4" />{es ? 'Capturar punto manual' : 'Add manual point'}</button><button onClick={() => { setPoints([]); setEditingPlotId(null); setPlotName(''); setPlotNotes(''); setMaterialType(''); setSelectedMaterialId(''); setSelectedSodId(''); }} disabled={!points.length || gpsBusy || tracking} className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold disabled:opacity-40"><RotateCcw className="mr-1 inline h-4 w-4" />{es ? 'Reiniciar' : 'Reset'}</button></div>
        {points.length > 0 && <button disabled={tracking} onClick={() => setPoints(current => current.slice(0,-1))} className="mt-2 w-full disabled:opacity-40 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold">{es ? 'Deshacer último punto' : 'Undo last point'}</button>}
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
              {materialUnitsNeeded > 0 ? <div className="mt-2 grid grid-cols-2 gap-2"><div><p className="text-[var(--ink-soft)]">{es ? 'Unidades calculadas' : 'Calculated units'}</p><b className="text-lg">{materialUnitsNeeded} {materialUnitLabel}</b></div><div><p className="text-[var(--ink-soft)]">{es ? 'Subtotal estimado' : 'Estimated subtotal'}</p><b>{selectedMaterial.currency} {materialTotal.toFixed(2)}</b></div><div><p className="text-[var(--ink-soft)]">{es ? 'Existencias registradas' : 'Recorded stock'}</p><b>{selectedMaterial.stock_quantity}</b></div></div> : <p className="mt-2 text-[var(--ink-soft)]">{es ? 'El registro del catálogo no tiene volumen de paquete ni cobertura de superficie verificados. No se calculará cantidad ni precio automáticamente.' : 'Package size does not specify liters or coverage. Quantity and price will not be calculated automatically.'}</p>}
              {materialUnitsNeeded > 0 && <p className="mt-2 text-[10px] text-[var(--ink-soft)]">{materialUnitsNeeded > selectedMaterial.stock_quantity ? (es ? 'Supera las existencias registradas; confirma disponibilidad.' : 'Exceeds recorded stock; confirm availability.') : (es ? 'Existencias registradas; confirma antes de comprar.' : 'Recorded stock; confirm before purchase.')}</p>}
            </div>}
          </> : <p className="mt-2 rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]">{es ? 'Este material no aparece actualmente en el catálogo. Puedes calcular el volumen manualmente abajo, pero no se mostrará un precio ni existencias inventadas.' : 'This material is not currently listed in the catalog. You can calculate volume manually below, but no price or stock will be invented.'}</p>)}
        </div>
        {materialType !== 'pavers' ? <>
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
        </> : <div className="mt-4 rounded-2xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]">{es ? 'Los adoquines se calculan por superficie y dimensiones de cada pieza, no por volumen de relleno. Añade el tamaño y cobertura exactos del producto cuando esté registrado en el catálogo.' : 'Pavers are estimated by surface area and each unit’s dimensions, not by fill volume. Add exact product dimensions and coverage when they are recorded in the catalog.'}</div>}
      </section>}
      {tool === 'light' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2"><Sun className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Medidor inteligente de luz' : 'Intelligent light meter'}</h2></div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Mide la iluminación del lugar y compárala con las necesidades de luz de las plantas del Centro de Conocimiento Botánico.' : 'Measure the site illumination and compare it with plant light requirements from the Botanical Knowledge Center.'}</p>
        <div className="my-4 rounded-2xl bg-[var(--surface-2)] p-4 text-center"><Sun className="mx-auto h-8 w-8 text-amber-500" /><b className="mt-2 block text-3xl tabular-nums">{hasMeasuredLux ? Math.round(lux).toLocaleString() : cameraFallbackActive && cameraResponse !== null ? `${Math.round(cameraResponse * 100)}%` : '—'} {hasMeasuredLux ? 'lux' : cameraFallbackActive ? (es ? 'brillo relativo' : 'relative brightness') : 'lux'}</b><p className="text-[11px] font-semibold text-[var(--ink-soft)]">{liveLux !== null ? (es ? 'Medido por el sensor ambiental del dispositivo' : 'Measured by the device ambient-light sensor') : cameraEstimatedLux !== null ? (es ? 'Estimación de cámara calibrada · no sustituye un luxómetro' : 'Calibrated camera estimate · not a replacement for a lux meter') : cameraFallbackActive ? (es ? 'Brillo relativo de cámara · no es una lectura de lux' : 'Camera relative brightness · not a lux reading') : (es ? 'Aún no hay lectura. Toca «Leer sensor».' : 'No reading yet. Tap “Read sensor”.')}</p><p className="text-sm font-bold">{lightAssessment.label}</p><p className="mt-1 text-xs text-[var(--ink-soft)]">{lightAssessment.guidance}</p><p className="mt-1 text-[10px] text-[var(--ink-soft)]">{es ? 'Confianza orientativa: ' : 'Guidance confidence: '}{lightAssessment.confidence}</p></div>

        <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={startLightSensor} className="rounded-xl bg-[var(--palm)] px-3 py-3 text-xs font-bold text-white"><Activity className="mr-1 inline h-4 w-4" />{es ? 'Leer sensor' : 'Read sensor'}</button><button onClick={stopLightSensor} className="rounded-xl border border-[var(--line)] px-3 py-3 text-xs font-bold">{es ? 'Detener sensor' : 'Stop sensor'}</button></div>
        {sensorStatus && <p className="mt-2 text-xs text-[var(--ink-soft)]" role="status">{sensorStatus}</p>}
        <div className="mt-3 rounded-2xl border border-[var(--line)] p-3">
          <div className="flex items-center gap-2"><Camera className="h-4 w-4 text-[var(--palm)]" /><b className="text-sm">{es ? 'Calibración de cámara' : 'Camera calibration'}</b></div>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Rutina avanzada local para crear un perfil de respuesta de esta cámara. No se guardan ni se envían imágenes.' : 'Advanced on-device routine to create this camera’s response profile. Images are not saved or uploaded.'}</p>
          {CAMERA_CALIBRATION_ENABLED && cameraProfile && <p className="mt-2 text-xs font-semibold text-[var(--ink-soft)]">{cameraProfile.quality === 'reference_calibrated' ? (es ? 'Perfil calibrado con lecturas de referencia' : 'Reference-calibrated profile') : (es ? 'Perfil relativo; falta luxómetro de referencia' : 'Relative profile; reference lux meter needed')}</p>}
          {CAMERA_CALIBRATION_ENABLED && (!cameraCalibrationOpen ? <button onClick={startCameraCalibration} className="mt-3 w-full rounded-xl border border-[var(--line)] px-3 py-3 text-xs font-bold"><Camera className="mr-1 inline h-4 w-4" />{es ? 'Iniciar calibración guiada' : 'Start guided calibration'}</button> : <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between text-xs"><b>{es ? 'Paso' : 'Step'} {cameraStageIndex + 1} / 4</b><span className="text-[var(--ink-soft)]">{Math.round(((cameraStageIndex + 1) / 4) * 100)}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--palm)]" style={{ width: ((cameraStageIndex + 1) / 4) * 100 + '%' }} /></div>
            <video ref={cameraVideoRef} autoPlay muted playsInline className={`w-full rounded-xl bg-black aspect-video object-cover ${cameraFallbackActive || cameraCalibrationOpen ? '' : 'hidden'}`} />
            <b className="block text-sm">{es ? cameraStages[cameraStageIndex].esTitle : cameraStages[cameraStageIndex].title}</b>
            <p className="text-xs text-[var(--ink-soft)]">{es ? cameraStages[cameraStageIndex].esInstruction : cameraStages[cameraStageIndex].instruction}</p>
            <label className="block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Lux medidos con un luxómetro (opcional)' : 'Lux measured with a lux meter (optional)'}<input type="number" min="0" value={cameraReferenceLux} onChange={event => setCameraReferenceLux(event.target.value)} placeholder={es ? 'Dejar vacío si no tienes luxómetro' : 'Leave blank if no lux meter'} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label>
            <div className="grid grid-cols-2 gap-2"><button onClick={captureCameraCalibrationStage} className="rounded-xl bg-[var(--palm)] px-3 py-3 text-xs font-bold text-white"><Check className="mr-1 inline h-4 w-4" />{es ? 'Capturar paso' : 'Capture step'}</button><button onClick={() => { stopCameraCalibration(); setCameraCalibrationOpen(false); }} className="rounded-xl border border-[var(--line)] px-3 py-3 text-xs font-bold">{es ? 'Cancelar' : 'Cancel'}</button></div>
            <canvas ref={cameraCanvasRef} className="hidden" />
            <p className="text-[10px] text-[var(--ink-soft)]">{es ? 'La imagen solo se analiza en memoria para calcular brillo promedio. El modo sin luxómetro crea una escala relativa, no una medición exacta de lux.' : 'Frames are analyzed in memory for brightness only. Without a lux meter this creates a relative scale, not an exact lux measurement.'}</p>
          </div>)}
          {CAMERA_CALIBRATION_ENABLED && cameraStatus && <p className="mt-2 text-xs text-[var(--ink-soft)]" role="status">{cameraStatus}</p>}
        </div>
        <div className="mt-5"><h3 className="flex items-center gap-2 text-base font-extrabold"><Leaf className="h-4 w-4 text-[var(--palm)]" />{es ? 'Plantas recomendadas' : 'Recommended plants'}</h3><p className="mb-3 mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Coincidencias basadas en los requisitos de luz registrados en el Centro de Conocimiento.' : 'Matches based on sunlight requirements recorded in the Botanical Knowledge Center.'}</p>
          {!hasMeasuredLux ? <p className="rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]">{es ? 'Toma una lectura con el sensor para ver plantas recomendadas.' : 'Take a sensor reading to see recommended plants.'}</p> : lightMatches.length ? <div className="space-y-2">{lightMatches.map(match => <div key={match.profile.id} className="rounded-2xl border border-[var(--line)] p-3"><div className="flex items-start justify-between gap-2"><div><b className="text-sm">{match.profile.identification.common_names[es ? 'es' : 'en'][0] || match.profile.taxonomy.scientific_name}</b><p className="text-xs italic text-[var(--ink-soft)]">{match.profile.taxonomy.scientific_name}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${match.fit === 'strong' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{match.fit === 'strong' ? (es ? 'Buena coincidencia' : 'Strong fit') : (es ? 'Posible' : 'Possible fit')}</span></div><p className="mt-1 text-xs text-[var(--ink-soft)]">{match.reason} {match.profile.is_verified ? (es ? 'Requisito verificado.' : 'Requirement verified.') : (es ? 'Requisito aún sin verificar.' : 'Requirement not yet verified.')}</p></div>)}</div> : <p className="rounded-xl bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-soft)]">{es ? 'No hay perfiles públicos coincidentes todavía.' : 'No matching public profiles are available yet.'}</p>}
        </div>
        <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-3 text-[10px] leading-relaxed text-[var(--ink-soft)]">{es ? 'Una lectura puntual de lux no mide la luz diaria total ni la radiación fotosintética (PPFD/DLI). El sensor depende del hardware y permisos del teléfono. Observa el lugar durante varias horas antes de plantar.' : 'A single lux reading does not measure daily light integral or photosynthetic radiation (PPFD/DLI). Sensor availability depends on phone hardware and permissions. Observe the location across several hours before planting.'}</p>
      </section>}
      {tool === 'irrigation' && <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"><div className="flex items-center gap-2"><Waves className="h-5 w-5 text-[var(--palm)]" /><h2 className="text-lg font-extrabold">{es ? 'Planificador básico de riego' : 'Basic irrigation planner'}</h2></div><p className="mt-1 text-sm text-[var(--ink-soft)]">{es ? 'Estimación de emisores según separación aproximada.' : 'Estimate emitter count from approximate spacing.'}</p><label className="mt-4 block text-xs font-semibold text-[var(--ink-soft)]">{es ? 'Área por planta (m²)' : 'Area per plant (m²)'}<input type="number" min="0.01" step="0.01" value={coverage} onChange={(event) => setCoverage(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)]" /></label><div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-4"><p className="text-xs text-[var(--ink-soft)]">{es ? 'Plantas / emisores estimados' : 'Estimated plants / emitters'}</p><b className="text-3xl">{Number.isFinite(irrigationEmitters) ? irrigationEmitters : 0}</b><p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Basado en el área medida o introducida: ' : 'Based on measured or manually entered area: '}{m2.toFixed(1)} m²</p></div><p className="mt-3 text-[10px] text-[var(--ink-soft)]">{es ? 'No sustituye el diseño hidráulico: presión, caudal, pendientes y necesidades de cada especie deben verificarse.' : 'Not a hydraulic design. Verify pressure, flow, slope and species-specific water needs.'}</p></section>}
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] p-3 text-xs text-[var(--ink-soft)]"><Trees className="h-4 w-4 shrink-0 text-[var(--palm)]" />{es ? 'Más herramientas profesionales se añadirán aquí: diseño de jardines, estimación de plantas y planificación de proyectos.' : 'More professional tools will be added here: garden layouts, plant quantities and project planning.'}</div>
    </div>
  );
};
