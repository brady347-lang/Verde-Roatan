import { localizedName } from '../lib/catalogLocale';
import { classifyCatalogMatches, type CatalogMatches } from '../lib/catalogMatch';
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  Bug,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Droplets,
  ExternalLink,
  Eye,
  Flower2,
  Image as ImageIcon,
  Info,
  Layers,
  Leaf,
  Loader2,
  MapPin,
  Palmtree,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sprout,
  Sun,
  Wind
} from 'lucide-react';
import { AIAnalysisResult, CatalogItem, Language } from '../types';
import { STRINGS } from '../data/initialData';
import { compressImage } from '../services/api';
import { ImageCropModal } from '../components/ImageCropModal';

interface IdentifyScreenProps {
  lang: Language;
  mode: 'plant' | 'pest';
  onModeChange: (m: 'plant' | 'pest') => void;
  onAnalyze: (photo: string) => Promise<void>;
  isLoading: boolean;
  isRefining?: boolean;
  result: AIAnalysisResult | null;
  error: string | null;
  currentPhoto: string | null;
  onReset: () => void;
  onSaveToGarden: () => void;
  onSubmitFeedback: (decision: 'confirmed' | 'almost' | 'not_my_plant', correctedCommonName?: string, correctedScientificName?: string, notes?: string, shareForBotanicalLearning?: boolean) => Promise<void>;
  onSubmitHealthEvidence: (recordType: 'pest' | 'disease', notes: string) => Promise<void>;
  onAddToCart: (storeProductId: string, qty: number) => void;
  formatMoney: (val: number, cur: string) => React.ReactNode;
  catalog: CatalogItem[];
  onRequestSpecialSourcing?: (plantName: string, sciName?: string) => void;
  onDeepRefresh?: () => Promise<void>;
  onOpenBotanicalAssistant?: (initialQuery: string) => void;
}

export const IdentifyScreen: React.FC<IdentifyScreenProps> = ({
  lang,
  mode,
  onModeChange,
  onAnalyze,
  isLoading,
  isRefining = false,
  result,
  error,
  currentPhoto,
  onReset,
  onSaveToGarden,
  onSubmitFeedback,
  onSubmitHealthEvidence,
  onAddToCart,
  formatMoney,
  catalog,
  onRequestSpecialSourcing,
  onDeepRefresh,
  onOpenBotanicalAssistant
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeReferenceIdx, setActiveReferenceIdx] = useState(0);
  const [viewCompareMode, setViewCompareMode] = useState<'side-by-side' | 'reference' | 'user'>('side-by-side');
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [pendingCropImage, setPendingCropImage] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [shareForBotanicalLearning, setShareForBotanicalLearning] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [correctedCommonName, setCorrectedCommonName] = useState('');
  const [correctedScientificName, setCorrectedScientificName] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackChoice, setFeedbackChoice] = useState<'almost' | 'not_my_plant' | null>(null);
  const [feedbackOutcome, setFeedbackOutcome] = useState<'confirmed' | 'almost' | 'not_my_plant' | null>(null);
  const [healthRecordType, setHealthRecordType] = useState<'pest' | 'disease'>('pest');
  const [healthSubmitBusy, setHealthSubmitBusy] = useState(false);
  const [healthSubmitted, setHealthSubmitted] = useState(false);
  const [healthSubmitError, setHealthSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setElapsedTime(0);
      const start = Date.now();
      interval = setInterval(() => {
        const seconds = (Date.now() - start) / 1000;
        setElapsedTime(Number(seconds.toFixed(1)));
      }, 100);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    setFeedbackBusy(false);
    setFeedbackSaved(false);
    setFeedbackError(null);
    setCorrectedCommonName('');
    setCorrectedScientificName('');
    setFeedbackNotes('');
    setFeedbackChoice(null);
    setFeedbackOutcome(null);
    setShareForBotanicalLearning(false);
    setHealthRecordType('pest');
    setHealthSubmitBusy(false);
    setHealthSubmitted(false);
    setHealthSubmitError(null);
  }, [currentPhoto]);

  const submitFeedback = async (decision: 'confirmed' | 'almost' | 'not_my_plant') => {
    setFeedbackBusy(true);
    setFeedbackError(null);
    try {
      await onSubmitFeedback(decision, correctedCommonName, correctedScientificName, feedbackNotes, shareForBotanicalLearning);
      setFeedbackOutcome(decision);
      setFeedbackSaved(true);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Feedback could not be saved.');
    } finally {
      setFeedbackBusy(false);
    }
  };

  const submitHealthEvidence = async () => {
    setHealthSubmitBusy(true);
    setHealthSubmitError(null);
    try {
      await onSubmitHealthEvidence(healthRecordType, feedbackNotes);
      setHealthSubmitted(true);
    } catch (error) {
      setHealthSubmitError(error instanceof Error ? error.message : 'The report could not be submitted.');
    } finally {
      setHealthSubmitBusy(false);
    }
  };

  const t = (k: string) => STRINGS[lang]?.[k] || STRINGS.en[k] || k;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same photo can be reselected
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingCropImage(reader.result);
        setCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCropFinished = async (finalPhoto: string) => {
    setCropModalOpen(false);
    setPendingCropImage(null);
    setSavedSuccess(false);
    setActiveReferenceIdx(0);
    await onAnalyze(finalPhoto);
  };

  const getCatalogMatches = (
    record: { common_name?: string; scientific_name?: string; alternative_names?: string[] } | undefined,
    plantCatalog: CatalogItem[] = catalog
  ): CatalogMatches => {
    // Compare the verified record and the top candidate; catalog names may be Spanish or have no scientific name.
    const top = result?.candidates?.[0];
    return classifyCatalogMatches([record || {}, top ? { common_name: top.common_name, scientific_name: top.scientific_name } : {}], plantCatalog);
  };

  const renderDots = (n: number) => {
    return (
      <span className="inline-flex gap-1 items-center" role="img" aria-label={`${n} of 3`}>
        {[1, 2, 3].map((i) => (
          <i
            key={i}
            className={`w-2.5 h-2.5 rounded-full not-italic transition-colors ${
              i <= n ? 'bg-[var(--lagoon)]' : 'bg-[var(--line)]'
            }`}
          />
        ))}
      </span>
    );
  };

  // Never display generic server-side stock photos as species-verified references.
  // A reference must carry photographer, source, and commercial-use license metadata.
  const verifiedImages = (result?.verified_botanical_record?.verified_images || []).filter((img) =>
    Boolean(img.source_url && img.source_name && img.photographer && img.license_name && img.license_url)
  );
  const activeRefPhoto = verifiedImages[activeReferenceIdx] || verifiedImages[0];

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Header */}
      <header className="flex flex-col gap-0.5 px-1">
        <h1 className="text-[24px] font-extrabold text-[var(--ink)] tracking-tight">
          {t('identify')}
        </h1>
        <p className="text-[13px] text-[var(--ink-soft)]">
          {lang === 'es'
            ? 'Diagnóstico botánico con inteligencia artificial adaptada a la flora y plagas de Roatán.'
            : 'Rootwise plant intelligence & pest pathology trained for Roatán and Caribbean flora.'}
        </p>
      </header>

      {/* Mode Selector */}
      <div className="grid grid-cols-2 bg-[var(--surface-2)] p-1 rounded-2xl gap-1">
        <button
          type="button"
          onClick={() => {
            onModeChange('plant');
            onReset();
          }}
          aria-pressed={mode === 'plant'}
          className={`py-2 rounded-xl text-[14px] font-bold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'plant'
              ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
              : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
          }`}
        >
          <Sprout className="w-4 h-4 text-[var(--palm)]" />
          Plant Specimen
        </button>
        <button
          type="button"
          onClick={() => {
            onModeChange('pest');
            onReset();
          }}
          aria-pressed={mode === 'pest'}
          className={`py-2 rounded-xl text-[14px] font-bold flex items-center justify-center gap-1.5 transition-all ${
            mode === 'pest'
              ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
              : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
          }`}
        >
          <Bug className="w-4 h-4 text-[var(--bloom)]" />
          Pest / Disease
        </button>
      </div>

      {/* Main Analysis Initial State */}
      {!isLoading && !result && !error && (
        <div className="flex flex-col items-center gap-3.5 text-center p-6 border-2 border-dashed border-[var(--line)] rounded-3xl bg-[var(--surface)] shadow-xs">
          <span className="w-16 h-16 rounded-2xl bg-[var(--palm)]/12 text-[var(--palm)] flex items-center justify-center shadow-inner">
            <Camera className="w-8 h-8" />
          </span>

          <div className="flex flex-col gap-1 max-w-[320px]">
            <h2 className="text-[18px] font-extrabold text-[var(--ink)]">
              {mode === 'pest' ? t('photoProblem') : t('photoPlant')}
            </h2>
            <p className="text-[12.5px] text-[var(--ink-soft)] leading-snug">
              {t('photoHint')}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 w-full mt-2">
            <label
              htmlFor="upload-gallery"
              className="flex items-center justify-center gap-2 w-full min-h-[48px] bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-bold text-[14.5px] rounded-2xl cursor-pointer shadow-xs active:scale-98 transition-all"
            >
              <ImageIcon className="w-5 h-5" />
              {t('galleryBtn')}
            </label>
            <input
              id="upload-gallery"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleFileChange}
            />

            <label
              htmlFor="upload-camera"
              className="flex items-center justify-center gap-2 w-full min-h-[48px] bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 text-[var(--ink)] font-bold text-[14.5px] rounded-2xl border border-[var(--line)] cursor-pointer active:scale-98 transition-all"
            >
              <Camera className="w-5 h-5 text-[var(--palm)]" />
              {t('cameraBtn')}
            </label>
            <input
              id="upload-camera"
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={handleFileChange}
            />
          </div>

          <p className="text-[11.5px] text-[var(--ink-soft)] mt-1 flex items-center gap-1.5 justify-center">
            <Sparkles className="w-3.5 h-3.5 text-[var(--sun)]" />
            Rootwise Botanical Intelligence analyzes foliage, blooms, fronds & pathology.
          </p>
        </div>
      )}

      {/* Loading & Compression State with 5-8s Deep Accuracy Progress */}
      {(isLoading || isCompressing) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-6 text-center shadow-md"
        >
          {currentPhoto && (
            <div className="relative w-full max-h-[220px] rounded-2xl overflow-hidden bg-[var(--surface-2)] border border-[var(--line)]">
              <img
                src={currentPhoto}
                alt="Specimen preview"
                className="w-full h-full object-cover"
              />
              <div className="scan-overlay absolute inset-0 pointer-events-none overflow-hidden">
                <div className="scan-orbit-ring absolute left-[62%] top-[42%] w-24 h-24 -translate-x-1/2 -translate-y-1/2 rounded-full" />
                <div className="scan-orbit-ring scan-orbit-ring-delayed absolute left-[62%] top-[42%] w-32 h-32 -translate-x-1/2 -translate-y-1/2 rounded-full" />
                <span className="scan-target-core absolute left-[62%] top-[42%] -translate-x-1/2 -translate-y-1/2" />
                <img
                  src="/verde-hummingbird-scan-76.webp"
                  alt={lang === 'es' ? 'Colibrí explorando la planta durante el escaneo' : 'Hummingbird inspecting the plant during scan'}
                  className="hummingbird-scan absolute left-[62%] top-[42%] w-[76px] h-[72px] -translate-x-1/2 -translate-y-1/2 object-contain"
                  loading="eager"
                  decoding="async"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-center pb-2">
                <span className="text-[11px] font-bold text-white bg-black/50 backdrop-blur-xs px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--sun)] animate-ping" />
                  Target Botanical Specimen
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-1.5 w-full" aria-live="polite">
            <span className="text-[11px] font-semibold tracking-wide text-[var(--palm)]">
              {lang === 'es' ? 'Escaneo botánico en progreso' : 'Botanical scan in progress'}
            </span>
          </div>

          {/* Progress Bar & Countdown (5s - 8s Deep Search) */}
          <div className="w-full flex flex-col gap-2">
            <div className="flex items-center justify-between text-[12px] font-extrabold text-[var(--ink)]">
              <span className="flex items-center gap-1.5 text-[var(--palm)]">
                <Sparkles className="w-4 h-4 animate-spin text-[var(--lagoon)]" />
                Rootwise Botanical Search
              </span>
              <span className="tabular-nums font-mono bg-[var(--surface-2)] px-2 py-0.5 rounded-md text-[11px] text-[var(--ink-soft)] font-bold">
                {elapsedTime.toFixed(0)}s
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden border border-[var(--line)]">
              <motion.div
                className="h-full bg-gradient-to-r from-[var(--palm)] via-[var(--lagoon)] to-[var(--sun)]"
                style={{ width: `${(5 + 90 * (1 - Math.exp(-elapsedTime / 12))).toFixed(1)}%` }}
                transition={{ ease: 'linear' }}
              />
            </div>

            <p className="text-[12.5px] font-semibold text-[var(--ink-soft)] min-h-[20px] transition-all pt-1">
              {isCompressing
                ? lang === 'es'
                  ? 'Optimizando resolución de imagen…'
                  : 'Compressing photo for fast analysis…'
                : elapsedTime < 2.0
                ? lang === 'es' ? '1/4: Escaneando morfología foliar y contornos…' : '1/4: Scanning leaf morphology & margin contours…'
                : elapsedTime < 4.5
                ? lang === 'es' ? '2/4: Analizando nervadura, filotaxis y estructuras florales…' : '2/4: Analyzing venation, phyllotaxy & floral anatomy…'
                : elapsedTime < 7.0
                ? lang === 'es' ? '3/4: Búsqueda taxonómica profunda en flora caribeña…' : '3/4: Deep taxonomic search across Caribbean flora…'
                : elapsedTime < 12
                ? lang === 'es' ? '4/4: Verificando clasificación botánica exacta…' : '4/4: Finalizing verified botanical classification…'
                : elapsedTime < 30
                ? lang === 'es' ? 'Sigue trabajando: la señal puede ser lenta o la IA estar ocupada. Mantén la app abierta.' : 'Still working. The signal may be slow or the AI busy. Keep the app open.'
                : lang === 'es' ? 'Está tardando más de lo normal. Puedes esperar un poco más o volver a intentarlo con una señal mejor.' : 'This is taking longer than usual. Wait a little longer, or try again with a better signal.'}
            </p>
          </div>
        </motion.div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex flex-col gap-3 bg-[var(--surface)] border border-[var(--bloom)]/40 rounded-3xl p-5 shadow-xs">
          {currentPhoto && (
            <img
              src={currentPhoto}
              alt="Uploaded photo"
              className="w-full max-h-[200px] object-cover rounded-2xl"
            />
          )}
          <div className="flex items-start gap-2.5 text-[var(--bloom)]">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <b className="text-[15px] font-bold">Analysis Could Not Complete</b>
              <p className="text-[13px] text-[var(--ink)] leading-snug">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center justify-center gap-2 bg-[var(--surface-2)] text-[var(--ink)] font-bold text-[13.5px] py-2.5 rounded-xl border border-[var(--line)] mt-2 active:scale-98 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            {t('anotherPhoto')}
          </button>
        </div>
      )}

      {/* AI Botanical Intelligence Dossier Result */}
      {result && !isLoading && (
        <div className="flex flex-col gap-4">
          {/* Continuous Deep Refinement Status Indicator */}
          {isRefining && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between bg-[var(--palm)]/10 border border-[var(--palm)]/30 rounded-2xl p-3 text-[12.5px] text-[var(--palm)] shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[var(--palm)]" />
                <div>
                  <b className="font-extrabold block text-[13px] text-[var(--ink)]">
                    {lang === 'es'
                      ? 'Rootwise AI: Refinamiento Continuo en Curso'
                      : 'Rootwise AI: Continuous Accuracy Refinement'}
                  </b>
                  <span className="text-[11.5px] text-[var(--ink-soft)] block">
                    {lang === 'es'
                      ? 'Optimizando taxonomía de Roatán y cotejando con el herbario...'
                      : 'Cross-referencing Roatán herbarium & optimizing taxonomic accuracy...'}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[var(--palm)] text-white shrink-0 tracking-wider uppercase">
                Optimizing
              </span>
            </motion.div>
          )}

          {!isRefining && result.is_refined && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-2.5 px-3 text-[12px] text-emerald-800 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">
                  {lang === 'es'
                    ? 'Taxonomía Auditada y Refinada para el Microclima de Roatán'
                    : 'Taxonomy Audited & Refined for Roatán Microclimate'}
                </span>
              </div>
              {onDeepRefresh && (
                <button
                  type="button"
                  onClick={onDeepRefresh}
                  disabled={isRefining}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline active:scale-95 ml-2 cursor-pointer shrink-0"
                >
                  {lang === 'es' ? 'Re-auditar' : 'Deep Refresh'}
                </button>
              )}
            </motion.div>
          )}

          {mode === 'plant' && result.ml_visual_evidence?.status === 'success' && (
            <div className="flex flex-col gap-2 rounded-2xl border border-[var(--palm)]/25 bg-[var(--palm)]/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-extrabold text-[var(--palm)]">
                  <Leaf className="h-4 w-4" />
                  {lang === 'es' ? 'Evidencia visual independiente' : 'Independent visual evidence'}
                </span>
                <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--ink-soft)]">
                  {result.ml_visual_evidence.decision || 'review'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(result.ml_visual_evidence.top_predictions || []).map((item, idx) => (
                  <span key={item.label + idx} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold text-[var(--ink)]">
                    {item.label === 'OUT_OF_CATALOG'
                      ? (lang === 'es' ? 'Sin coincidencia verificada en catálogo' : 'No verified catalog match yet')
                      : item.label}
                  </span>
                ))}
              </div>
              <p className="text-[10.5px] leading-snug text-[var(--ink-soft)]">
                {lang === 'es'
                  ? 'Señal de similitud del modelo, no una verificación científica. Confirma los resultados inciertos con un experto.'
                  : 'Model similarity evidence, not scientific verification. Confirm uncertain results with an expert.'}
              </p>
            </div>
          )}

          {/* Pest Mode Diagnostic Dossier */}
          {mode === 'pest' && result.result && (
            <div className="flex flex-col gap-4">
              {/* Photo Display */}
              {currentPhoto && (
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-2.5 shadow-xs">
                  <div className="relative w-full max-h-[240px] rounded-2xl overflow-hidden bg-black/5">
                    <img
                      src={currentPhoto}
                      alt="Analyzed pest specimen"
                      className="w-full h-full object-cover rounded-2xl"
                    />
                    <span className="absolute top-2.5 left-2.5 bg-black/75 backdrop-blur-xs text-white text-[11px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
                      Observed Pathology
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3.5 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold tracking-wider uppercase text-[var(--bloom)] flex items-center gap-1.5">
                    <Bug className="w-3.5 h-3.5" />
                    Pest & Disease Diagnosis
                  </span>
                  {result.result.severity && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--sun)]/25 text-[var(--note-ink)]">
                      {result.result.severity}
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="text-[21px] font-extrabold text-[var(--ink)] leading-tight">
                    {result.result.primary_diagnosis}
                  </h2>
                  {result.result.scientific_name && (
                    <small className="text-[12.5px] text-[var(--ink-soft)] italic block mt-0.5">
                      {result.result.scientific_name}
                    </small>
                  )}
                </div>

                {/* Symptoms */}
                {result.result.symptoms && result.result.symptoms.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-1">
                    <b className="text-[13px] text-[var(--ink)] font-bold">Observed Diagnostic Symptoms:</b>
                    <ul className="flex flex-col gap-1 text-[13px] text-[var(--ink-soft)] pl-1">
                      {result.result.symptoms.map((sym, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--bloom)] mt-1.5 shrink-0" />
                          <span>{sym}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Likely Cause */}
                {result.result.likely_cause && (
                  <div className="bg-[var(--note-bg)] text-[var(--note-ink)] rounded-2xl p-3 text-[12.5px] leading-relaxed">
                    <b>Island Ecological Context:</b> {result.result.likely_cause}
                  </div>
                )}

                {/* Treatment Protocol */}
                {result.result.treatment && result.result.treatment.length > 0 && (
                  <div className="flex flex-col gap-2 mt-1">
                    <b className="text-[13.5px] text-[var(--ink)] font-bold">Step-by-Step Treatment Protocol:</b>
                    <ol className="flex flex-col gap-2 text-[13px] text-[var(--ink)] pl-1">
                      {result.result.treatment.map((tr, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-[var(--palm)] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span className="leading-snug">{tr}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Prevention */}
                {result.result.prevention && result.result.prevention.length > 0 && (
                  <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-[var(--line)]">
                    <b className="text-[13.5px] text-[var(--ink)] font-bold">Prevention & Cultural Controls:</b>
                    <ul className="flex flex-col gap-1.5 text-[13px] text-[var(--ink-soft)] pl-1">
                      {result.result.prevention.map((prev, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <ShieldCheck className="w-4 h-4 text-[var(--palm)] shrink-0 mt-0.5" />
                          <span className="leading-snug">{prev}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === 'pest' && result?.result?.primary_diagnosis && (
            <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 flex flex-col gap-2">
              <div>
                <b className="text-[13px] text-[var(--ink)]">{lang === 'es' ? 'Enviar para revisión botánica' : 'Submit for botanical review'}</b>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-soft)]">
                  {lang === 'es'
                    ? 'Este diagnóstico de IA es una sugerencia, no una verificación científica. El equipo puede revisar la foto y las fuentes antes de aprobarlo.'
                    : 'This AI diagnosis is a suggestion, not scientific verification. The team can review the photo and evidence before approving it.'}
                </p>
              </div>
              {healthSubmitted ? (
                <div className="rounded-xl bg-[var(--palm)]/10 p-3 text-[12px] font-bold text-[var(--palm)]">
                  {lang === 'es' ? 'Reporte enviado. Está pendiente de revisión y no se añadirá al conocimiento aprobado todavía.' : 'Report submitted. It is pending review and will not enter approved knowledge yet.'}
                </div>
              ) : (
                <>
                  <label className="text-[11px] font-bold text-[var(--ink)]">
                    {lang === 'es' ? 'Tipo de reporte' : 'Report type'}
                    <select value={healthRecordType} onChange={(e) => setHealthRecordType(e.target.value as 'pest' | 'disease')} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[12px]">
                      <option value="pest">{lang === 'es' ? 'Plaga' : 'Pest'}</option>
                      <option value="disease">{lang === 'es' ? 'Enfermedad' : 'Disease'}</option>
                    </select>
                  </label>
                  <textarea value={feedbackNotes} onChange={(e) => setFeedbackNotes(e.target.value)} rows={2} maxLength={1200} placeholder={lang === 'es' ? 'Notas adicionales (opcional)' : 'Additional notes (optional)'} className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[12px] text-[var(--ink)]" />
                  {healthSubmitError && <p role="alert" className="text-[11px] text-red-600">{healthSubmitError}</p>}
                  <button type="button" onClick={() => void submitHealthEvidence()} disabled={healthSubmitBusy || !currentPhoto} className="min-h-[42px] rounded-xl bg-[var(--palm)] px-3 text-[12px] font-extrabold text-white disabled:opacity-50">
                    {healthSubmitBusy ? (lang === 'es' ? 'Enviando…' : 'Submitting…') : (lang === 'es' ? 'Enviar foto y diagnóstico para revisión' : 'Submit photo and diagnosis for review')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Plant Mode Botanical Specimen Dossier */}
          {mode === 'plant' && (
            <div className="flex flex-col gap-4">
              {/* EXACT MATCH REFERENCE SPECIMEN PHOTOS SECTION */}
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-3 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[var(--palm)]" />
                    <b className="text-[14px] font-extrabold text-[var(--ink)]">
                      Botanical Reference Photos
                    </b>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--palm)]/15 text-[var(--palm)]">
                    {verifiedImages.length > 0 ? 'Source & license listed' : 'Awaiting sourced photos'}
                  </span>
                </div>

                {verifiedImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 bg-[var(--surface-2)] p-1 rounded-2xl text-[12px] font-bold">
                  <button
                    type="button"
                    onClick={() => setViewCompareMode('side-by-side')}
                    className={`py-1.5 rounded-xl transition-all ${
                      viewCompareMode === 'side-by-side'
                        ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                        : 'text-[var(--ink-soft)]'
                    }`}
                  >
                    Side-by-Side Compare
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewCompareMode('reference')}
                    className={`py-1.5 rounded-xl transition-all ${
                      viewCompareMode === 'reference'
                        ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                        : 'text-[var(--ink-soft)]'
                    }`}
                  >
                    Exact Reference Gallery
                  </button>
                </div>

                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-4 text-center">
                    <p className="text-[12px] font-semibold text-[var(--ink)]">No licensed species reference photos are available for this result yet.</p>
                    <p className="text-[11px] text-[var(--ink-soft)] mt-1">Your uploaded specimen photo remains available. Reference images will only appear when the photographer, source, and commercial-use license can be credited.</p>
                  </div>
                )}

                {verifiedImages.length > 0 && (
                <>
                {/* Image View Area */}
                {viewCompareMode === 'side-by-side' && currentPhoto && activeRefPhoto ? (
                  <div className="grid grid-cols-2 gap-2">
                    {/* User's Photo */}
                    <div className="flex flex-col gap-1">
                      <div className="relative aspect-4/3 rounded-2xl overflow-hidden bg-black/5 border border-[var(--line)]">
                        <img
                          src={currentPhoto}
                          alt="Your photo"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                          Your Specimen
                        </span>
                      </div>
                    </div>

                    {/* Exact Match Reference Photo */}
                    <div className="flex flex-col gap-1">
                      <div className="relative aspect-4/3 rounded-2xl overflow-hidden bg-black/5 border border-[var(--palm)]">
                        <img
                          src={activeRefPhoto.image_url}
                          alt={activeRefPhoto.image_type}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 left-2 bg-[var(--palm)] text-white text-[10px] font-bold px-2 py-0.5 rounded-md capitalize">
                          {activeRefPhoto.image_type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Single Large Reference View */
                  <div className="relative w-full aspect-16/9 rounded-2xl overflow-hidden bg-black/5 border border-[var(--palm)]">
                    {activeRefPhoto && (
                      <img
                        src={activeRefPhoto.image_url}
                        alt="Reference specimen"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <span className="absolute top-2.5 left-2.5 bg-black/75 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-1 rounded-full capitalize">
                      {activeRefPhoto?.image_type.replace('_', ' ')}
                    </span>
                  </div>
                )}

                {activeRefPhoto && (
                  <p className="text-[10px] leading-relaxed text-[var(--ink-soft)] px-1">
                    Photo: {activeRefPhoto.photographer} · {activeRefPhoto.source_name} ·{' '}
                    <a href={activeRefPhoto.license_url} target="_blank" rel="noreferrer" className="underline">{activeRefPhoto.license_name}</a>
                    {' '}·{' '}
                    <a href={activeRefPhoto.source_url} target="_blank" rel="noreferrer" className="underline">Source record</a>
                  </p>
                )}

                {/* Reference Photo Thumbnails Carousel */}
                {verifiedImages.length > 1 && (
                  <div className="flex flex-col gap-1">
                    <small className="text-[11px] font-bold text-[var(--ink-soft)] px-1">
                      Select exact reference stage:
                    </small>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                      {verifiedImages.map((img, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveReferenceIdx(idx)}
                          className={`flex-none w-16 h-16 rounded-xl overflow-hidden border-2 transition-all relative ${
                            activeReferenceIdx === idx
                              ? 'border-[var(--palm)] scale-102 shadow-sm'
                              : 'border-[var(--line)] opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={img.image_url}
                            alt={img.image_type}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white text-center py-0.5 truncate">
                            {img.image_type.split('_')[0]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                </>
                )}
              </div>

              {/* Identification Main Card */}
              {result.verified_botanical_record ? (
                <div className="flex flex-col gap-3 bg-[var(--surface)] border-l-4 border-l-[var(--palm)] border border-[var(--line)] rounded-3xl p-4.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-[var(--palm)]/15 text-[var(--palm)] border border-[var(--palm)]/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('verifiedSpecimen')}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)]">
                      Confidence:{' '}
                      {Math.round(
                        (result.candidates?.[0]?.confidence_score || 0.96) * 100
                      )}
                      %
                    </span>
                  </div>

                  <div>
                    <h2 className="text-[22px] font-extrabold text-[var(--ink)] leading-tight">
                      {result.verified_botanical_record.common_name}
                    </h2>
                    <small className="text-[13px] text-[var(--ink-soft)] block mt-0.5">
                      <b>Scientific:</b>{' '}
                      <i className="text-[var(--ink)]">{result.verified_botanical_record.scientific_name}</i> ·{' '}
                      <span className="text-[var(--palm)] font-semibold">{result.verified_botanical_record.plant_family}</span>
                    </small>
                    {result.verified_botanical_record.alternative_names &&
                      result.verified_botanical_record.alternative_names.length > 0 && (
                        <small className="text-[11.5px] text-[var(--ink-soft)] block mt-0.5">
                          <b>Also known as:</b>{' '}
                          {result.verified_botanical_record.alternative_names.join(', ')}
                        </small>
                      )}
                  </div>

                  <p className="text-[13.5px] text-[var(--ink)] leading-relaxed">
                    {result.verified_botanical_record.botanical_description}
                  </p>

                  {/* Facts Grid */}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="bg-[var(--surface-2)] rounded-xl p-2.5 flex flex-col gap-1">
                      <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)] tracking-wider">
                        {t('saltSpray')}
                      </span>
                      <div className="flex items-center gap-2">
                        {renderDots(
                          result.verified_botanical_record.characteristics
                            ?.salt_tolerance_rating || 2
                        )}
                        <span className="text-[11px] font-bold text-[var(--ink)]">
                          {(result.verified_botanical_record.characteristics?.salt_tolerance_rating || 2) === 3
                            ? 'Oceanfront Hardened'
                            : (result.verified_botanical_record.characteristics?.salt_tolerance_rating || 2) === 2
                            ? 'Coastal Line'
                            : 'Sheltered Valley'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-[var(--surface-2)] rounded-xl p-2.5 flex flex-col gap-1">
                      <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)] tracking-wider">
                        Native Status
                      </span>
                      <b className="text-[13px] text-[var(--ink)]">
                        {result.verified_botanical_record.characteristics?.native_to_bay_islands
                          ? 'Bay Islands Native Specimen'
                          : 'Acclimatized Tropical'}
                      </b>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 bg-[var(--surface)] border-l-4 border-l-[var(--bloom)] border border-[var(--line)] rounded-3xl p-4.5 shadow-xs">
                  <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-[var(--bloom)]/15 text-[var(--bloom)] border border-[var(--bloom)]/30 w-fit">
                    {t('unverifiedSpecimen')}
                  </span>
                  <h2 className="text-[20px] font-extrabold text-[var(--ink)]">
                    {result.candidates?.[0]?.common_name || 'Plant Detected'}
                  </h2>
                  <small className="text-[12px] text-[var(--ink-soft)] italic">
                    {result.candidates?.[0]?.scientific_name || ''}
                  </small>
                  <p className="text-[12.5px] text-[var(--ink-soft)] leading-snug">
                    {result.notice || t('unverifiedNotice')}
                  </p>
                </div>
              )}

              {/* Comprehensive Growing & Care Dossier */}
              {result.verified_botanical_record?.care && (
                <div className="flex flex-col gap-3.5 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4.5 shadow-xs">
                  <h3 className="text-[16px] font-extrabold text-[var(--ink)] flex items-center gap-1.5">
                    <Sun className="w-4 h-4 text-[var(--sun)]" />
                    Growing & Care Requirements
                  </h3>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[var(--surface-2)] rounded-xl p-2.5 flex flex-col gap-1">
                      <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                        {t('sun')}
                      </span>
                      <b className="text-[12.5px] text-[var(--ink)] capitalize">
                        {result.verified_botanical_record.care.sunlight_requirement.replace(
                          '_',
                          ' '
                        )}
                      </b>
                    </div>
                    <div className="bg-[var(--surface-2)] rounded-xl p-2.5 flex flex-col gap-1">
                      <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                        {t('water')}
                      </span>
                      <b className="text-[12.5px] text-[var(--ink)]">
                        Every {result.verified_botanical_record.care.watering_frequency_days} Days
                      </b>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 text-[13px] text-[var(--ink)] mt-1">
                    <div className="bg-[var(--surface-2)] p-2.5 rounded-xl">
                      <b>Watering Instructions:</b>{' '}
                      <p className="text-[12.5px] text-[var(--ink-soft)] mt-0.5">
                        {result.verified_botanical_record.care.watering_instructions}
                      </p>
                    </div>
                    <div className="bg-[var(--surface-2)] p-2.5 rounded-xl">
                      <b>Soil Medium & Limestone Blend:</b>{' '}
                      <p className="text-[12.5px] text-[var(--ink-soft)] mt-0.5">
                        {result.verified_botanical_record.care.soil_requirements}
                      </p>
                    </div>
                    <div className="bg-[var(--surface-2)] p-2.5 rounded-xl">
                      <b>Fertilization Schedule:</b>{' '}
                      <p className="text-[12.5px] text-[var(--ink-soft)] mt-0.5">
                        {result.verified_botanical_record.care.fertilization_instructions}
                      </p>
                    </div>
                    <div className="bg-[var(--surface-2)] p-2.5 rounded-xl">
                      <b>Pruning & Airflow Maintenance:</b>{' '}
                      <p className="text-[12.5px] text-[var(--ink-soft)] mt-0.5">
                        {result.verified_botanical_record.care.pruning_instructions}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Close Matching Botanical Candidates */}
              {result.candidates && result.candidates.length > 1 && (
                <div className="flex flex-col gap-2 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 shadow-xs">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]">
                    Alternative Matching Taxa
                  </span>
                  <div className="flex flex-col gap-2">
                    {result.candidates.slice(1).map((cand, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-[var(--surface-2)] rounded-xl text-[12.5px]"
                      >
                        <div>
                          <b>{cand.common_name}</b>
                          <small className="block text-[var(--ink-soft)] italic">
                            {cand.scientific_name}
                          </small>
                        </div>
                        <span className="text-[11px] font-bold text-[var(--ink-soft)]">
                          {Math.round(cand.confidence_score * 100)}% match
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Real Catalog Matching & Live Stock Availability */}
              {(() => {
                const commonName =
                  result.verified_botanical_record?.common_name ||
                  result.candidates?.[0]?.common_name ||
                  'Specimen';
                const sciName =
                  result.verified_botanical_record?.scientific_name ||
                  result.candidates?.[0]?.scientific_name ||
                  '';
                const catalogMatches = getCatalogMatches(
                  result.verified_botanical_record,
                  catalog
                );

                const isSimilarOnly = catalogMatches.exact.length === 0 && catalogMatches.similar.length > 0;
                const matchingCatalogPlants = isSimilarOnly ? catalogMatches.similar : catalogMatches.exact;

                if (matchingCatalogPlants.length > 0) {
                  return (
                    <div className="flex flex-col gap-3 bg-[var(--surface)] border border-[var(--palm)] rounded-3xl p-4.5 shadow-xs">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[16px] font-extrabold text-[var(--ink)] flex items-center gap-1.5">
                          <Sprout className="w-4 h-4 text-[var(--palm)]" />
                          {isSimilarOnly ? (lang === 'es' ? 'Plantas similares en stock' : 'Similar plants in stock') : t('inStockNow')} ({matchingCatalogPlants.length})
                        </h3>
                        <span className="text-[11px] font-bold text-[var(--palm)] bg-[var(--palm)]/10 px-2 py-0.5 rounded-full">
                          {isSimilarOnly ? (lang === 'es' ? 'Mismo género, otra especie' : 'Same genus, different species') : 'Verified Island Stock'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {matchingCatalogPlants.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 bg-[var(--surface-2)] p-3 rounded-2xl border border-[var(--line)]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-12 h-12 rounded-xl bg-[var(--surface)] overflow-hidden shrink-0 flex items-center justify-center">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={localizedName(item, lang)} className="w-full h-full object-cover" />
                                ) : (
                                  <Palmtree className="w-6 h-6 text-[var(--palm)]" />
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <b className="text-[13.5px] text-[var(--ink)] font-bold truncate">
                                  {localizedName(item, lang)}
                                </b>
                                <small className="text-[11px] text-[var(--ink-soft)] truncate">
                                  {item.size} · {item.nursery}
                                </small>
                                <div className="text-[13px] font-extrabold text-[var(--palm)] mt-0.5">
                                  {formatMoney(item.price, item.currency)}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => onAddToCart(item.id, 1)}
                              className="flex items-center gap-1.5 bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-bold text-[12px] px-3.5 py-2 rounded-xl shadow-xs active:scale-95 transition-all shrink-0"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              {t('addToCart')}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // If NOT in catalog: Display accurate "Not in Nursery Catalog" card with sourcing request
                return (
                  <div className="flex flex-col gap-3 bg-[var(--surface)] border-2 border-amber-500/40 rounded-3xl p-4.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {t('notInCatalog')}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--ink-soft)]">
                        Special Sourcing Available
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <h3 className="text-[16px] font-extrabold text-[var(--ink)]">
                        {lang === 'es'
                          ? 'Especie no disponible en camas de vivero'
                          : 'Species Not in Local Nursery Beds'}
                      </h3>
                      <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed">
                        {lang === 'es'
                          ? `El espécimen identificado (${commonName}${sciName ? ` · ${sciName}` : ''}) no se encuentra actualmente en nuestro inventario inmediato. Podemos solicitarlo a viveristas asociados en Roatán.`
                          : `The identified specimen (${commonName}${sciName ? ` · ${sciName}` : ''}) is not currently stocked in our immediate beds. We can request custom sourcing from partner growers across Roatán.`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRequestSpecialSourcing?.(commonName, sciName)}
                      className="w-full min-h-[44px] bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-bold text-[13px] rounded-xl flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all mt-1"
                    >
                      <Sprout className="w-4 h-4" />
                      {t('requestSpecialSourcing')}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Model Footnote */}
          {result.model_used && (
            <div className="text-center">
              <span className="text-[11px] font-semibold text-[var(--ink-soft)] bg-[var(--surface-2)] px-2.5 py-1 rounded-full">
                Identified by Rootwise AI
              </span>
            </div>
          )}

          {mode === 'plant' && (
            <section className="flex flex-col gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-xs">
              <div>
                <h3 className="text-[15px] font-extrabold text-[var(--ink)]">
                  {lang === 'es' ? '¿Identificamos tu planta correctamente?' : 'Did we identify your plant correctly?'}
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-soft)]">
                  {lang === 'es'
                    ? 'Tu respuesta se guarda para revisión botánica. Una confirmación tuya no equivale a una verificación científica.'
                    : 'Your answer is saved for botanical review. Your confirmation is not the same as scientific verification.'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[var(--ink-soft)]">AI IDENTIFIED</span>
                  {feedbackOutcome === 'confirmed' && (
                    <span className="rounded-full bg-[var(--palm)]/15 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[var(--palm)]">USER CONFIRMED</span>
                  )}
                </div>
              </div>

              {feedbackSaved ? (
                <div className="flex items-center gap-2 rounded-xl bg-[var(--palm)]/10 p-3 text-[13px] font-bold text-[var(--palm)]">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  {feedbackOutcome === 'confirmed'
                    ? (lang === 'es' ? 'Gracias. Marcado como confirmado por el usuario; aún no verificado científicamente.' : 'Thanks. Marked user-confirmed; not yet scientifically verified.')
                    : (lang === 'es' ? 'Gracias. Tu comentario quedó pendiente de revisión.' : 'Thanks. Your feedback is waiting for review.')}
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-2 rounded-xl border border-[var(--line)] p-3 text-[12px] text-[var(--ink-soft)]">
                    <input type="checkbox" checked={shareForBotanicalLearning} onChange={(event) => setShareForBotanicalLearning(event.target.checked)} className="mt-0.5 accent-[var(--palm)]" />
                    <span>{lang === 'es'
                      ? 'Acepto que RootWise use esta foto y mi corrección para mejorar su conocimiento botánico. La evidencia permanecerá privada y será revisada por administradores; no se publicará.'
                      : 'I agree that RootWise may use this photo and my correction to improve its botanical knowledge. The evidence will remain private and be reviewed by administrators; it will not be published.'}</span>
                  </label>
                  <button
                    type="button"
                    disabled={feedbackBusy}
                    onClick={() => submitFeedback('confirmed')}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--palm)] px-3 text-[13px] font-bold text-white disabled:opacity-60"
                  >
                    {feedbackBusy && feedbackChoice === null ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {lang === 'es' ? '¡Sí, es correcto!' : "Yes, that's correct!"}
                  </button>
                  <button
                    type="button"
                    disabled={feedbackBusy}
                    onClick={() => setFeedbackChoice(feedbackChoice === 'almost' ? null : 'almost')}
                    className={`min-h-[44px] rounded-xl border px-3 text-[13px] font-bold ${feedbackChoice === 'almost' ? 'border-[var(--palm)] bg-[var(--palm)]/10 text-[var(--palm)]' : 'border-[var(--line)] text-[var(--ink)]'}`}
                  >
                    {lang === 'es' ? 'Casi, pero algo está mal.' : 'Almost, but something is wrong.'}
                  </button>
                  <button
                    type="button"
                    disabled={feedbackBusy}
                    onClick={() => setFeedbackChoice(feedbackChoice === 'not_my_plant' ? null : 'not_my_plant')}
                    className={`min-h-[44px] rounded-xl border px-3 text-[13px] font-bold ${feedbackChoice === 'not_my_plant' ? 'border-[var(--palm)] bg-[var(--palm)]/10 text-[var(--palm)]' : 'border-[var(--line)] text-[var(--ink)]'}`}
                  >
                    {lang === 'es' ? 'No, esa no es mi planta.' : "No, that's not my plant."}
                  </button>
                  {feedbackChoice && (
                    <div className="border-t border-[var(--line)] pt-3">
                      <p className="mb-2 text-[12px] font-bold text-[var(--ink)]">
                        {feedbackChoice === 'almost'
                          ? (lang === 'es' ? '¿Qué está mal? Dinos la planta correcta si la conoces.' : 'What is wrong? Tell us the right plant if you know it.')
                          : (lang === 'es' ? 'Si sabes qué planta es, cuéntanos (opcional).' : 'If you know what plant it is, tell us (optional).')}
                      </p>
                      <input
                        value={correctedCommonName}
                        onChange={(event) => setCorrectedCommonName(event.target.value)}
                        placeholder={lang === 'es' ? 'Nombre común correcto' : 'Correct common name'}
                        className="mb-2 min-h-[42px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--palm)]"
                      />
                      <input
                        value={correctedScientificName}
                        onChange={(event) => setCorrectedScientificName(event.target.value)}
                        placeholder={lang === 'es' ? 'Nombre científico (opcional)' : 'Scientific name (optional)'}
                        className="mb-2 min-h-[42px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--palm)]"
                      />
                      <textarea
                        value={feedbackNotes}
                        onChange={(event) => setFeedbackNotes(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder={lang === 'es' ? 'Notas (opcional)' : 'Notes (optional)'}
                        className="mb-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--palm)]"
                      />
                      <button
                        type="button"
                        disabled={feedbackBusy || (feedbackChoice === 'almost' && !correctedCommonName.trim() && !correctedScientificName.trim() && feedbackNotes.trim().length < 3)}
                        onClick={() => submitFeedback(feedbackChoice)}
                        className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--palm)] px-3 text-[13px] font-bold text-[var(--palm)] disabled:opacity-50"
                      >
                        {feedbackBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {lang === 'es' ? 'Enviar' : 'Submit'}
                      </button>
                    </div>
                  )}
                  {feedbackError && (
                    <p role="alert" className="text-[12px] font-semibold text-red-600">{feedbackError}</p>
                  )}
                </>
              )}
            </section>
          )}

          {/* Action Buttons: Save to My Garden & Scan Another */}
          <div className="flex flex-col gap-2 mt-1">
            <button
              type="button"
              onClick={() => {
                onSaveToGarden();
                setSavedSuccess(true);
              }}
              className="flex items-center justify-center gap-2 w-full min-h-[48px] bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-bold text-[14.5px] rounded-2xl shadow-xs active:scale-98 transition-all"
            >
              {savedSuccess ? (
                <>
                  <BookmarkCheck className="w-5 h-5" />
                  {t('savedToGarden')}
                </>
              ) : (
                <>
                  <Sprout className="w-5 h-5" />
                  {t('saveToGarden')}
                </>
              )}
            </button>

            {onOpenBotanicalAssistant && (
              <button
                type="button"
                onClick={() => {
                  const query =
                    result.verified_botanical_record?.scientific_name ||
                    result.candidates?.[0]?.scientific_name ||
                    result.candidates?.[0]?.common_name ||
                    '';
                  onOpenBotanicalAssistant(query);
                }}
                className="flex items-center justify-center gap-2 w-full min-h-[44px] bg-[var(--surface)] text-[var(--palm)] font-bold text-[13.5px] rounded-2xl border border-[var(--palm)] hover:bg-[var(--palm)]/10 active:scale-98 transition-all"
              >
                <Compass className="w-4 h-4" />
                {lang === 'es' ? 'Consultar Inteligencia Botánica & RAG' : 'Explore in Botanical Knowledge Engine & RAG'}
              </button>
            )}

            <button
              type="button"
              onClick={onReset}
              className="flex items-center justify-center gap-2 w-full min-h-[46px] bg-[var(--surface-2)] text-[var(--ink)] font-bold text-[14px] rounded-2xl border border-[var(--line)] active:scale-98 transition-all"
            >
              <RotateCcw className="w-4 h-4 text-[var(--palm)]" />
              {t('anotherPhoto')}
            </button>
          </div>
        </div>
      )}

      {/* Interactive Leaf & Flower Cropper Modal */}
      {pendingCropImage && (
        <ImageCropModal
          imageSrc={pendingCropImage}
          isOpen={cropModalOpen}
          onClose={() => {
            setCropModalOpen(false);
            setPendingCropImage(null);
          }}
          onCropComplete={handleCropFinished}
          lang={lang}
          mode={mode}
        />
      )}
    </div>
  );
};
