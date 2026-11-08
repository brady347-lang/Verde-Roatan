import React, { useState } from 'react';
import {
  Compass,
  Sparkles,
  Sun,
  CloudSun,
  CloudRain,
  Waves,
  Shield,
  Layers,
  Flower2,
  TreePine,
  ArrowRight,
  ShoppingCart,
  Check,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Leaf
} from 'lucide-react';
import { CatalogItem, GardenAdvisorResult, Language } from '../types';
import { fetchGardenRecommendations } from '../services/api';

interface GardenAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: CatalogItem[];
  onAddToCart: (item: CatalogItem) => void;
  lang: Language;
  currency: 'HNL' | 'USD';
  exchangeRateHnl: number;
}

export const GardenAdvisorModal: React.FC<GardenAdvisorModalProps> = ({
  isOpen,
  onClose,
  catalog,
  onAddToCart,
  lang,
  currency,
  exchangeRateHnl
}) => {
  const isEs = lang === 'es';

  // State
  const [sunlight, setSunlight] = useState<'full_sun' | 'partial_shade' | 'deep_shade' | 'indoor'>('full_sun');
  const [soilType, setSoilType] = useState<'beach_sand' | 'volcanic_clay' | 'draining_loam' | 'containers'>('beach_sand');
  const [exposure, setExposure] = useState<'oceanfront' | 'hillside_breeze' | 'sheltered_interior'>('oceanfront');
  const [watering, setWatering] = useState<'daily' | 'automated_drip' | 'rain_only' | 'weekend_only'>('daily');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['privacy_screen', 'colorful_blooms']);
  const [customNotes, setCustomNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GardenAdvisorResult | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const toggleGoal = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  const applyPreset = (preset: 'oceanfront_villa' | 'shaded_patio' | 'hillside_estate') => {
    if (preset === 'oceanfront_villa') {
      setSunlight('full_sun');
      setSoilType('beach_sand');
      setExposure('oceanfront');
      setWatering('daily');
      setSelectedGoals(['wind_resilient', 'privacy_screen']);
      setCustomNotes(
        isEs
          ? 'Villa frente al mar en West Bay con brisa salina directa y arena de playa.'
          : 'West Bay beachfront villa with direct saline sea spray and sandy soil.'
      );
    } else if (preset === 'shaded_patio') {
      setSunlight('partial_shade');
      setSoilType('containers');
      setExposure('sheltered_interior');
      setWatering('automated_drip');
      setSelectedGoals(['colorful_blooms', 'lush_tropical']);
      setCustomNotes(
        isEs
          ? 'Patio cubierto en Sandy Bay con macetas grandes y luz filtrada.'
          : 'Covered patio in Sandy Bay with large planters and filtered light.'
      );
    } else {
      setSunlight('full_sun');
      setSoilType('volcanic_clay');
      setExposure('hillside_breeze');
      setWatering('rain_only');
      setSelectedGoals(['edible_fruit', 'drought_tolerant']);
      setCustomNotes(
        isEs
          ? 'Jardín en la colina de French Harbour con suelo arcilloso rojo y vistas panorámicas.'
          : 'Hillside lot in French Harbour with rich red clay soil and gusty trade winds.'
      );
    }
  };

  const handleConsult = async () => {
    setLoading(true);
    setResult(null);

    const conditionsText = `
Sunlight: ${sunlight.replace('_', ' ')}
Soil/Substrate: ${soilType.replace('_', ' ')}
Microclimate/Salt: ${exposure.replace('_', ' ')}
Watering: ${watering.replace('_', ' ')}
    `.trim();

    const goalsText = `
Desired Goals: ${selectedGoals.join(', ')}
Special Notes: ${customNotes || 'None specified'}
Location: Roatán Island, Bay Islands, Honduras
    `.trim();

    try {
      const adv = await fetchGardenRecommendations({
        conditions: conditionsText,
        goals: goalsText,
        catalogItems: catalog,
        lang
      });
      setResult(adv);
    } catch (err) {
      console.error('Advisor error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = (item: CatalogItem) => {
    onAddToCart(item);
    setAddedIds((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [item.id]: false }));
    }, 2500);
  };

  const formatPrice = (usd: number) => {
    if (currency === 'USD') return `$${usd.toFixed(2)}`;
    return `L ${(usd * exchangeRateHnl).toFixed(0)}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] rounded-3xl w-full max-w-2xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--line)] flex items-center justify-between bg-gradient-to-r from-[var(--palm)]/10 via-transparent to-[var(--lagoon)]/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[var(--palm)] to-emerald-600 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[19px] font-extrabold tracking-tight text-[var(--ink)]">
                  {isEs ? 'Asesor Botánico de Jardín' : 'AI Garden Consultant'}
                </h2>
                <span className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[var(--palm)]/15 text-[var(--palm)] border border-[var(--palm)]/25">
                  Rootwise AI
                </span>
              </div>
              <p className="text-[12.5px] text-[var(--ink-soft)] font-medium">
                {isEs
                  ? 'Recomendaciones personalizadas según el microclima insular de Roatán'
                  : 'Tailored plant & soil matching for your specific Roatán microclimate'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--ink-soft)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5 no-scrollbar">
          {/* Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                {isEs ? 'Plantillas Rápidas de Roatán' : 'Roatán Island Presets'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset('oceanfront_villa')}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--palm)] hover:text-[var(--palm)] transition-all flex items-center gap-1.5"
              >
                <Waves className="w-3.5 h-3.5 text-cyan-600" />
                <span>{isEs ? 'Villa Frente al Mar (West Bay)' : 'Oceanfront Beach (West Bay)'}</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('shaded_patio')}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--palm)] hover:text-[var(--palm)] transition-all flex items-center gap-1.5"
              >
                <CloudSun className="w-3.5 h-3.5 text-amber-500" />
                <span>{isEs ? 'Patio Sombreado (Sandy Bay)' : 'Shaded Patio (Sandy Bay)'}</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('hillside_estate')}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--palm)] hover:text-[var(--palm)] transition-all flex items-center gap-1.5"
              >
                <Compass className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isEs ? 'Colina Panorámica (French Harbour)' : 'Hillside Garden (French Harbour)'}</span>
              </button>
            </div>
          </div>

          {/* Sunlight */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-[var(--ink)] flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              <span>{isEs ? '1. Exposición Solar' : '1. Sunlight Exposure'}</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'full_sun', label: isEs ? 'Sol Pleno (6+ hrs)' : 'Full Sun (6+ hrs)', desc: isEs ? 'Playa o terraza abierta' : 'Direct tropical rays' },
                { id: 'partial_shade', label: isEs ? 'Sombra Parcial' : 'Partial Shade', desc: isEs ? 'Luz matutina o filtrada' : 'Dappled or 3-5h morning' },
                { id: 'deep_shade', label: isEs ? 'Sombra Profunda' : 'Deep Shade', desc: isEs ? 'Bajo copas de árboles' : 'Under forest canopy' },
                { id: 'indoor', label: isEs ? 'Interior / Galería' : 'Covered Porch', desc: isEs ? 'Mucha luz indirecta' : 'Bright ambient light' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSunlight(opt.id as any)}
                  className={`p-2.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                    sunlight === opt.id
                      ? 'border-[var(--palm)] bg-[var(--palm)]/10 font-bold text-[var(--palm)] shadow-xs'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--ink-soft)]'
                  }`}
                >
                  <span className="text-[12.5px] leading-snug">{opt.label}</span>
                  <span className="text-[10.5px] text-[var(--ink-soft)] font-normal mt-1">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Soil & Ground */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-[var(--ink)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-700" />
              <span>{isEs ? '2. Tipo de Suelo o Terreno' : '2. Soil & Ground Type'}</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'beach_sand', label: isEs ? 'Arena Costera' : 'Coastal Sand', desc: isEs ? 'Drenaje ultra rápido' : 'Porous coral sand' },
                { id: 'volcanic_clay', label: isEs ? 'Arcilla Roja' : 'Volcanic Clay', desc: isEs ? 'Cocos / cerro fértil' : 'Hillside dense clay' },
                { id: 'draining_loam', label: isEs ? 'Tierra Negra / Franco' : 'Rich Loam', desc: isEs ? 'Mezclada con composta' : 'Enriched topsoil' },
                { id: 'containers', label: isEs ? 'Macetas / Jardineras' : 'Pots & Planters', desc: isEs ? 'Sustrato controlado' : 'Container potting mix' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSoilType(opt.id as any)}
                  className={`p-2.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                    soilType === opt.id
                      ? 'border-[var(--palm)] bg-[var(--palm)]/10 font-bold text-[var(--palm)] shadow-xs'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--ink-soft)]'
                  }`}
                >
                  <span className="text-[12.5px] leading-snug">{opt.label}</span>
                  <span className="text-[10.5px] text-[var(--ink-soft)] font-normal mt-1">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Wind & Salt Spray */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-[var(--ink)] flex items-center gap-2">
                <Waves className="w-4 h-4 text-cyan-600" />
                <span>{isEs ? '3. Brisa Marina & Salitre' : '3. Salt Spray & Wind'}</span>
              </label>
              <select
                value={exposure}
                onChange={(e) => setExposure(e.target.value as any)}
                className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[var(--ink)] focus:outline-none focus:border-[var(--palm)]"
              >
                <option value="oceanfront">{isEs ? 'Frente al Mar (Salitre Alto y Viento)' : 'Oceanfront (High Salt Spray & Wind)'}</option>
                <option value="hillside_breeze">{isEs ? 'Colina / Viento Alisio Moderado' : 'Hillside / Moderate Trade Winds'}</option>
                <option value="sheltered_interior">{isEs ? 'Protegido / Interior de la Isla' : 'Sheltered Interior / Low Wind'}</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-bold text-[var(--ink)] flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-blue-500" />
                <span>{isEs ? '4. Frecuencia de Riego' : '4. Irrigation & Watering'}</span>
              </label>
              <select
                value={watering}
                onChange={(e) => setWatering(e.target.value as any)}
                className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[var(--ink)] focus:outline-none focus:border-[var(--palm)]"
              >
                <option value="daily">{isEs ? 'Riego diario con manguera' : 'Daily hose watering'}</option>
                <option value="automated_drip">{isEs ? 'Riego por goteo automático' : 'Automated drip system'}</option>
                <option value="rain_only">{isEs ? 'Solo lluvia de temporada' : 'Rain-fed seasonal only'}</option>
                <option value="weekend_only">{isEs ? 'Fines de semana / Casa de vacaciones' : 'Weekends only (Vacation home)'}</option>
              </select>
            </div>
          </div>

          {/* Goals */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-[var(--ink)] flex items-center gap-2">
              <Leaf className="w-4 h-4 text-[var(--palm)]" />
              <span>{isEs ? '5. Objetivos de su Proyecto' : '5. Your Garden Goals'}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'privacy_screen', label: isEs ? 'Muro Verde / Privacidad' : 'Privacy Living Screen' },
                { id: 'colorful_blooms', label: isEs ? 'Flores & Colores Vivos' : 'Vibrant Island Blooms' },
                { id: 'wind_resilient', label: isEs ? 'Resistente a Huracanes' : 'Storm & Wind Resilient' },
                { id: 'edible_fruit', label: isEs ? 'Frutos Tropicales' : 'Edible Fruit / Herbs' },
                { id: 'drought_tolerant', label: isEs ? 'Bajo Mantenimiento' : 'Low Maintenance / Hardy' },
                { id: 'lush_tropical', label: isEs ? 'Follaje Exótico Selvático' : 'Lush Jungle Resort Vibe' }
              ].map((g) => {
                const active = selectedGoals.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGoal(g.id)}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all flex items-center gap-1.5 border ${
                      active
                        ? 'bg-[var(--palm)] text-white border-[var(--palm)] shadow-xs'
                        : 'bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--palm)]'
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5" />}
                    <span>{g.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Freeform Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-[var(--ink)]">
              {isEs ? 'Detalles o metas adicionales (opcional)' : 'Additional Details or Garden Goals (Optional)'}
            </label>
            <textarea
              rows={2}
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder={
                isEs
                  ? 'Ej: Cerca de la piscina, pendiente pronunciada, busco plantas que no atraigan plagas y den sombra fresca...'
                  : 'E.g., Near pool area, steep hillside slope, looking for salt-hardy palms and vibrant groundcover...'
              }
              className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-2xl px-3.5 py-2.5 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-soft)]/60 focus:outline-none focus:border-[var(--palm)]"
            />
          </div>

          {/* Consult Button */}
          <button
            type="button"
            onClick={handleConsult}
            disabled={loading}
            className="w-full min-h-[48px] bg-gradient-to-r from-[var(--palm)] to-emerald-700 hover:from-[var(--palm)]/90 hover:to-emerald-700/90 text-white font-extrabold text-[15px] rounded-2xl shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>{isEs ? 'Consultando Asesor Botánico con IA...' : 'Consulting Botanical Advisor...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-amber-300" />
                <span>{isEs ? 'Generar Recomendación de Plantas' : 'Get Catalog Recommendations'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* AI Result Section */}
          {result && (
            <div className="flex flex-col gap-4 pt-2 border-t border-[var(--line)] animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Summary */}
              <div className="bg-[var(--surface-2)] p-4 rounded-2xl border border-[var(--palm)]/30 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[var(--palm)]">
                  <Sparkles className="w-4 h-4" />
                  <b className="text-[13.5px] font-extrabold">
                    {isEs ? 'Diagnóstico & Estrategia Botánica' : 'Botanical Strategy & Assessment'}
                  </b>
                </div>
                <p className="text-[13px] text-[var(--ink)] leading-relaxed">{result.summary}</p>
                {result.conditions_assessment && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-[var(--line)] text-[11.5px]">
                    {result.conditions_assessment.sun_and_microclimate && (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-[var(--ink-soft)] uppercase tracking-wider text-[10px]">
                          {isEs ? 'Microclima' : 'Microclimate'}
                        </span>
                        <span className="text-[var(--ink)]">{result.conditions_assessment.sun_and_microclimate}</span>
                      </div>
                    )}
                    {result.conditions_assessment.soil_and_drainage && (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-[var(--ink-soft)] uppercase tracking-wider text-[10px]">
                          {isEs ? 'Sustrato' : 'Drainage & Soil'}
                        </span>
                        <span className="text-[var(--ink)]">{result.conditions_assessment.soil_and_drainage}</span>
                      </div>
                    )}
                    {result.conditions_assessment.wind_and_salt_tolerance && (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-[var(--ink-soft)] uppercase tracking-wider text-[10px]">
                          {isEs ? 'Salinidad / Viento' : 'Salt & Wind'}
                        </span>
                        <span className="text-[var(--ink)]">{result.conditions_assessment.wind_and_salt_tolerance}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Recommended Catalog Items */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-extrabold text-[var(--ink)] flex items-center gap-2">
                    <TreePine className="w-4 h-4 text-[var(--palm)]" />
                    <span>{isEs ? 'Plantas & Insumos Recomendados' : 'Matched Products from Nursery Catalog'}</span>
                  </h3>
                  <span className="text-[11.5px] font-bold text-[var(--palm)]">
                    {result.recommendations.length} {isEs ? 'coincidencias' : 'matches'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {result.recommendations.map((rec) => {
                    const item = rec.catalog_item;
                    const isAdded = item ? Boolean(addedIds[item.id]) : false;

                    return (
                      <div
                        key={rec.product_id}
                        className="bg-[var(--surface-2)] p-3.5 rounded-2xl border border-[var(--line)] hover:border-[var(--palm)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3">
                          {item?.image_url ? (
                            <img
                              src={item.image_url}
                              alt={rec.product_name}
                              className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[var(--line)]"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-[var(--surface)] border border-[var(--line)] flex items-center justify-center text-[var(--palm)] shrink-0">
                              <Flower2 className="w-7 h-7" />
                            </div>
                          )}
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <b className="text-[14.5px] font-extrabold text-[var(--ink)] leading-snug">
                                {rec.product_name}
                              </b>
                              <span className="text-[10.5px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                {rec.match_score}% {isEs ? 'match' : 'fit'}
                              </span>
                            </div>
                            <p className="text-[12px] text-[var(--ink)] mt-0.5">{rec.why_it_fits}</p>
                            {rec.care_and_placement_tip && (
                              <small className="text-[11.5px] text-[var(--palm)] font-medium mt-1">
                                💡 {rec.care_and_placement_tip}
                              </small>
                            )}
                          </div>
                        </div>

                        {item && (
                          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--line)]">
                            <b className="text-[15px] font-extrabold text-[var(--ink)]">
                              {formatPrice(item.price)}
                            </b>
                            <button
                              type="button"
                              onClick={() => handleAddToCart(item)}
                              className={`px-3.5 py-2 rounded-xl text-[12.5px] font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                                isAdded
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white active:scale-95'
                              }`}
                            >
                              {isAdded ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{isEs ? '¡Agregado!' : 'Added!'}</span>
                                </>
                              ) : (
                                <>
                                  <ShoppingCart className="w-3.5 h-3.5" />
                                  <span>{isEs ? 'Agregar' : 'Add to Cart'}</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Island Pro Tips */}
              {result.island_pro_tips && result.island_pro_tips.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl flex flex-col gap-1.5">
                  <b className="text-[12.5px] text-amber-800 dark:text-amber-300 font-extrabold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>{isEs ? 'Consejos Prácticos para Roatán' : 'Roatán Island Pro Tips'}</span>
                  </b>
                  <ul className="list-disc list-inside text-[12px] text-[var(--ink)] space-y-1">
                    {result.island_pro_tips.map((tip, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
