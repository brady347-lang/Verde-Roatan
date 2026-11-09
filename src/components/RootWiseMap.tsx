import React, { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { TrackPoint } from '../services/gpsTracking';

interface Props {
  points: TrackPoint[];
  follow: boolean;
  lang: 'en' | 'es';
}

const OPEN_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function fieldFeatures(points: TrackPoint[]) {
  const features: Array<Record<string, unknown>> = [];
  if (points.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: points.length >= 3 ? 'boundary' : 'track' },
      geometry: { type: 'LineString', coordinates: points.map(point => [point.lon, point.lat]) }
    });
  }
  if (points.length >= 3) {
    features.push({
      type: 'Feature',
      properties: { kind: 'area' },
      geometry: { type: 'Polygon', coordinates: [[...points.map(point => [point.lon, point.lat]), [points[0].lon, points[0].lat]]] }
    });
  }
  points.forEach((point, index) => features.push({
    type: 'Feature',
    properties: { kind: 'point', index: index + 1, accuracy: point.accuracy },
    geometry: { type: 'Point', coordinates: [point.lon, point.lat] }
  }));
  return { type: 'FeatureCollection', features };
}

/**
 * RootWise field map: MapLibre GL JS renderer with OpenStreetMap-derived vector data.
 * The field geometry remains local; only the public basemap style/tiles require connectivity.
 */
export const RootWiseMap: React.FC<Props> = ({ points, follow, lang }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapError, setMapError] = useState(false);
  const es = lang === 'es';

  useEffect(() => {
    const first = points[0];
    if (!containerRef.current || !first) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPEN_MAP_STYLE,
      center: [first.lon, first.lat],
      zoom: 18,
      maxZoom: 21,
      minZoom: 2,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      map.addSource('rootwise-field', { type: 'geojson', data: fieldFeatures(points) as GeoJSON.FeatureCollection });
      map.addLayer({
        id: 'rootwise-field-area',
        type: 'fill',
        source: 'rootwise-field',
        filter: ['==', ['get', 'kind'], 'area'],
        paint: { 'fill-color': '#39a879', 'fill-opacity': 0.22 }
      });
      map.addLayer({
        id: 'rootwise-field-boundary',
        type: 'line',
        source: 'rootwise-field',
        filter: ['in', ['get', 'kind'], ['literal', ['boundary', 'track']]],
        paint: { 'line-color': '#087f5b', 'line-width': 4, 'line-opacity': 0.95 }
      });
      map.addLayer({
        id: 'rootwise-field-points',
        type: 'circle',
        source: 'rootwise-field',
        filter: ['==', ['get', 'kind'], 'point'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#087f5b',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    });
    map.on('error', () => setMapError(true));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !points.length) return;
    const update = () => {
      const source = map.getSource('rootwise-field') as GeoJSONSource | undefined;
      if (source) source.setData(fieldFeatures(points) as GeoJSON.FeatureCollection);
      if (follow) {
        const latest = points[points.length - 1];
        map.easeTo({ center: [latest.lon, latest.lat], zoom: Math.max(map.getZoom(), 18), duration: 180 });
      } else if (points.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        points.forEach(point => bounds.extend([point.lon, point.lat]));
        map.fitBounds(bounds, { padding: 36, maxZoom: 19, duration: 250 });
      }
    };
    if (map.isStyleLoaded()) update();
    else map.once('load', update);
  }, [points, follow]);

  return (
    <div className="relative w-full overflow-hidden rounded-b-2xl">
      <div ref={containerRef} className="h-[280px] w-full bg-[#e8f0e9]" aria-label={es ? 'Mapa de campo RootWise' : 'RootWise field map'} />
      {mapError && <div className="absolute left-2 top-2 max-w-[85%] rounded-xl bg-white/95 px-3 py-2 text-[11px] text-slate-700 shadow">
        {es ? 'El mapa base no está disponible sin conexión. Tus puntos GPS siguen guardados en este dispositivo.' : 'The basemap is unavailable offline. Your GPS points remain saved on this device.'}
      </div>}
    </div>
  );
};
