import React, { useState } from 'react';
import {
  AlertCircle,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
  X
} from 'lucide-react';
import { CatalogItem, Language, RegisteredSupplier } from '../types';
import { analyzeBotanicalImage, compressImage } from '../services/api';

interface PlantEditModalProps {
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
  onSave: (plant: CatalogItem) => Promise<string | null> | void;
  initialPlant?: CatalogItem | null;
  registeredSuppliers?: RegisteredSupplier[];
  onQuickAddSupplier?: (supplier: RegisteredSupplier) => void;
}

export const PlantEditModal: React.FC<PlantEditModalProps> = ({
  lang,
  isOpen,
  onClose,
  onSave,
  initialPlant,
  registeredSuppliers = [],
  onQuickAddSupplier
}) => {
  const isEditing = Boolean(initialPlant);

  const [name, setName] = useState(initialPlant?.name || '');
  const [sci, setSci] = useState(initialPlant?.sci || '');
  const [nameEs, setNameEs] = useState(initialPlant?.name_es || '');
  const [category, setCategory] = useState(initialPlant?.category || 'Palms');
  const [kind, setKind] = useState<'palm' | 'shrub' | 'flower' | 'grass'>(
    initialPlant?.kind === 'palm' || initialPlant?.kind === 'shrub' || initialPlant?.kind === 'flower' || initialPlant?.kind === 'grass'
      ? initialPlant.kind
      : 'palm'
  );
  const [price, setPrice] = useState<number>(initialPlant?.price || 350);
  const [currency, setCurrency] = useState<'HNL' | 'USD'>(initialPlant?.currency || 'HNL');
  const [size, setSize] = useState(initialPlant?.size || '5 Gallon · 4-5 ft');
  const [coverageAreaM2, setCoverageAreaM2] = useState(String(initialPlant?.material_spec?.coverage_area_m2 || ''));
  const [materialUnitLabel, setMaterialUnitLabel] = useState(initialPlant?.material_spec?.unit_label || '');
  const [stock, setStock] = useState<'In stock' | 'Low stock' | 'Out of stock'>(
    initialPlant?.stock || 'In stock'
  );
  const [stockQuantity, setStockQuantity] = useState<number>(initialPlant?.stock_quantity ?? 15);
  const [salt, setSalt] = useState<number>(initialPlant?.salt ?? 2);
  const [sun, setSun] = useState(initialPlant?.sun || 'Bright filtered / Full sun');
  const [water, setWater] = useState(initialPlant?.water || 'Every 3 days');
  const [pet, setPet] = useState<'safe' | 'check'>(initialPlant?.pet || 'safe');
  const [native, setNative] = useState<boolean>(initialPlant?.native_to_bay_islands ?? false);
  const [nursery, setNursery] = useState(
    initialPlant?.nursery ||
      (registeredSuppliers[0]
        ? `${registeredSuppliers[0].name} (${registeredSuppliers[0].location})`
        : 'Verde Roatán Nursery (Sandy Bay)')
  );
  const [imageUrl, setImageUrl] = useState(initialPlant?.image_url || '');
  const [note, setNote] = useState(initialPlant?.note || '');
  const [tagsInput, setTagsInput] = useState(initialPlant?.tags?.join(', ') || 'palm, tropical, hardy');
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // AI Auto-detection states
  const [isDetectingAI, setIsDetectingAI] = useState(false);
  const [aiDetectionNotice, setAiDetectionNotice] = useState<{
    commonName: string;
    scientificName: string;
    family?: string;
    confidence?: number;
  } | null>(null);
  const [previousManualValues, setPreviousManualValues] = useState<{
    name: string;
    sci: string;
    category: string;
    kind: 'palm' | 'shrub' | 'flower' | 'grass';
    salt: number;
    sun: string;
    water: string;
    pet: 'safe' | 'check';
    native: boolean;
    note: string;
    tagsInput: string;
  } | null>(null);

  // Inline supplier registration
  const [showAddSupplierInline, setShowAddSupplierInline] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupLocation, setNewSupLocation] = useState('');

  if (!isOpen) return null;

  // Auto-detect botanical specimen from base64 image using Rootwise AI
  const runAutoBotanicalDetection = async (base64Data: string) => {
    setIsDetectingAI(true);
    // Snapshot existing values for Undo option
    setPreviousManualValues({
      name,
      sci,
      category,
      kind,
      salt,
      sun,
      water,
      pet,
      native,
      note,
      tagsInput
    });

    try {
      const res = await analyzeBotanicalImage('plant', base64Data, lang);
      if (res && res.status === 'success') {
        const record = res.verified_botanical_record;
        const candidate = res.candidates?.[0];

        const detectedName = record?.common_name || candidate?.common_name || '';
        const detectedSci = record?.scientific_name || candidate?.scientific_name || '';
        const family = record?.plant_family || '';

        // Determine category and botanical kind intelligently
        const query = `${detectedName} ${detectedSci} ${family}`.toLowerCase();
        let inferredKind: 'palm' | 'shrub' | 'flower' | 'grass' = 'shrub';
        let inferredCategory = 'Shrubs';

        if (query.includes('palm') || query.includes('arecaceae') || query.includes('cocos') || query.includes('dypsis')) {
          inferredKind = 'palm';
          inferredCategory = 'Palms';
        } else if (
          query.includes('flower') ||
          query.includes('hibiscus') ||
          query.includes('bougainvillea') ||
          query.includes('plumeria') ||
          query.includes('orchid') ||
          query.includes('frangipani') ||
          query.includes('ixora') ||
          query.includes('mussaenda')
        ) {
          inferredKind = 'flower';
          inferredCategory = 'Flowers';
        } else if (query.includes('grass') || query.includes('sod') || query.includes('zoysia') || query.includes('peanut')) {
          inferredKind = 'grass';
          inferredCategory = 'Grasses';
        } else if (query.includes('tree') || query.includes('ficus') || query.includes('almond') || query.includes('mango')) {
          inferredKind = 'shrub';
          inferredCategory = 'Trees';
        } else if (query.includes('monstera') || query.includes('philodendron') || query.includes('pothos') || query.includes('groundcover')) {
          inferredKind = 'shrub';
          inferredCategory = 'Groundcover';
        }

        // Auto-populate all form parameters
        if (detectedName) setName(detectedName);
        if (detectedSci) setSci(detectedSci);
        setKind(inferredKind);
        setCategory(inferredCategory);

        if (record?.characteristics?.salt_tolerance_rating) {
          setSalt(Math.min(3, Math.max(1, Number(record.characteristics.salt_tolerance_rating))));
        }

        if (record?.care?.sunlight_requirement) {
          const sunReq = record.care.sunlight_requirement.toLowerCase();
          if (sunReq.includes('full') || sunReq.includes('tropical')) {
            setSun('Full tropical sun / Coastal exposure');
          } else if (sunReq.includes('bright') || sunReq.includes('indirect') || sunReq.includes('partial')) {
            setSun('Bright filtered light / Partial shade');
          } else {
            setSun(record.care.sunlight_requirement);
          }
        }

        if (record?.care?.watering_instructions || record?.care?.watering_frequency_days) {
          const wFreq = record.care.watering_frequency_days;
          const wInstr = record.care.watering_instructions;
          setWater(wFreq ? `Every ${wFreq} days (${wInstr ? wInstr.slice(0, 40) + '…' : 'moderate'})` : wInstr || 'Every 3 days');
        }

        if (record?.characteristics?.native_to_bay_islands !== undefined) {
          setNative(Boolean(record.characteristics.native_to_bay_islands));
        }

        if (record?.botanical_description) {
          setNote(record.botanical_description);
        }

        // Generate intelligent search tags
        const newTags = [
          inferredKind,
          inferredCategory.toLowerCase(),
          family ? family.toLowerCase() : null,
          record?.characteristics?.native_to_bay_islands ? 'native' : null,
          'tropical',
          'roatan'
        ].filter(Boolean) as string[];
        setTagsInput(Array.from(new Set(newTags)).join(', '));

        setAiDetectionNotice({
          commonName: detectedName || 'Identified Specimen',
          scientificName: detectedSci || '',
          family,
          confidence: candidate?.confidence_score || 0.95
        });
      }
    } catch (err) {
      console.warn('AI auto-detection error:', err);
    } finally {
      setIsDetectingAI(false);
    }
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingImg(true);
    setImageError(null);
    try {
      const base64 = await compressImage(file, 1200, 0.85);
      setImageUrl(base64);
      // Automatically detect plant specimen from photo and auto-fill parameters!
      await runAutoBotanicalDetection(base64);
    } catch (err) {
      console.error('Failed to compress plant image', err);
      setImageError(err instanceof Error ? err.message : 'Could not process that photo. Please try another one.');
    } finally {
      setIsProcessingImg(false);
    }
  };

  const handleManualDetectTrigger = async () => {
    if (!imageUrl) return;
    await runAutoBotanicalDetection(imageUrl);
  };

  const handleUndoAutoFill = () => {
    if (previousManualValues) {
      setName(previousManualValues.name);
      setSci(previousManualValues.sci);
      setCategory(previousManualValues.category);
      setKind(previousManualValues.kind);
      setSalt(previousManualValues.salt);
      setSun(previousManualValues.sun);
      setWater(previousManualValues.water);
      setPet(previousManualValues.pet);
      setNative(previousManualValues.native);
      setNote(previousManualValues.note);
      setTagsInput(previousManualValues.tagsInput);
      setAiDetectionNotice(null);
      setPreviousManualValues(null);
    }
  };

  const handleCreateSupplier = () => {
    if (!newSupName.trim() || !newSupLocation.trim()) return;
    const created: RegisteredSupplier = {
      id: `sup-${Date.now()}`,
      name: newSupName.trim(),
      location: newSupLocation.trim(),
      delivery_days: 1,
      active: true
    };
    onQuickAddSupplier?.(created);
    setNursery(`${created.name} (${created.location})`);
    setNewSupName('');
    setNewSupLocation('');
    setShowAddSupplierInline(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const plantRecord: CatalogItem = {
      id: initialPlant?.id || `p-${Date.now()}`,
      t: 'plant',
      name: name.trim(),
      // Only a name the admin typed or kept; the AI never fills this field.
      name_es: nameEs.trim() || undefined,
      sci: sci.trim(),
      category: category.trim(),
      kind,
      price: Number(price) || 0,
      currency,
      size: size.trim(),
      material_spec: kind === 'grass' && Number(coverageAreaM2) > 0
        ? { coverage_area_m2: Number(coverageAreaM2), ...(materialUnitLabel.trim() ? { unit_label: materialUnitLabel.trim() } : {}) }
        : undefined,
      stock,
      stock_quantity: Number(stockQuantity) || 0,
      salt: Number(salt) || 1,
      sun: sun.trim(),
      water: water.trim(),
      pet,
      native_to_bay_islands: native,
      nursery: nursery.trim() || (registeredSuppliers[0] ? `${registeredSuppliers[0].name} (${registeredSuppliers[0].location})` : 'Verde Roatán Nursery'),
      image_url: imageUrl.trim() || undefined,
      note: note.trim(),
      tags: parsedTags.length > 0 ? parsedTags : [kind, 'plant']
    };

    // Keep the form open until the database and storage steps finish, so a failure never loses the edits or photo.
    setSaving(true);
    setSaveError(null);
    let failure: string | null | void = null;
    try {
      failure = await onSave(plantRecord);
    } catch (err) {
      failure = err instanceof Error ? err.message : 'The change could not be saved.';
    }
    setSaving(false);
    if (failure) {
      setSaveError(failure);
      return;
    }
    onClose();
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-0 right-0 bottom-0 mx-auto max-w-[440px] max-h-[92dvh] overflow-y-auto z-50 bg-[var(--surface)] text-[var(--ink)] rounded-t-3xl border border-[var(--line)] border-b-0 px-4 pt-3 pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))] shadow-2xl animate-in slide-in-from-bottom duration-200"
      >
        <div className="w-10 h-1.5 rounded-full bg-[var(--line)] mx-auto mb-3" />

        <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
          <div>
            <h2 className="text-[19px] font-extrabold text-[var(--ink)]">
              {isEditing ? 'Edit Botanical Specimen' : 'Add New Island Plant'}
            </h2>
            <small className="text-[11.5px] text-[var(--ink-soft)]">
              {isEditing ? `Modifying ${initialPlant?.name}` : 'Catalog new tropical species in database'}
            </small>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)] hover:text-[var(--ink)] flex items-center justify-center font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 mt-3">
          {/* Active AI Detection Progress Bar */}
          {isDetectingAI && (
            <div className="p-3 rounded-2xl bg-[var(--lagoon)]/10 border border-[var(--lagoon)]/40 flex items-center gap-3 animate-pulse">
              <Loader2 className="w-5 h-5 text-[var(--lagoon)] animate-spin shrink-0" />
              <div className="flex-1">
                <p className="text-[12.5px] font-bold text-[var(--ink)]">
                  Rootwise Botanical Intelligence is analyzing your photo…
                </p>
                <p className="text-[11px] text-[var(--ink-soft)]">
                  Detecting specimen genus/species and auto-filling parameters.
                </p>
              </div>
            </div>
          )}

          {/* AI Auto-Detection Confirmation & Override Banner */}
          {aiDetectionNotice && !isDetectingAI && (
            <div className="p-3 rounded-2xl bg-[var(--palm)]/10 border border-[var(--palm)]/30 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--palm)] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12.5px] font-extrabold text-[var(--ink)]">
                      Auto-Detected:{' '}
                      <span className="text-[var(--palm)]">{aiDetectionNotice.commonName}</span>{' '}
                      {aiDetectionNotice.scientificName && (
                        <span className="italic font-normal text-[var(--ink-soft)]">
                          ({aiDetectionNotice.scientificName})
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-[var(--ink-soft)]">
                      Parameters populated. You can edit any parameter below if anything needs adjustment.
                    </p>
                  </div>
                </div>
                {previousManualValues && (
                  <button
                    type="button"
                    onClick={handleUndoAutoFill}
                    className="shrink-0 text-[11px] font-bold text-[var(--ink-soft)] hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--surface-2)]"
                    title="Undo auto-filled parameters"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Undo
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Photo Preview & Upload */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-bold text-[var(--ink)]">Specimen Photo *</label>
              <span className="text-[11px] text-[var(--ink-soft)]">
                Selecting a photo automatically identifies the plant
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden shrink-0 flex items-center justify-center relative">
                {imageUrl ? (
                  <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-7 h-7 text-[var(--ink-soft)] opacity-50" />
                )}
                {isDetectingAI && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--palm)] text-white text-[12.5px] font-bold cursor-pointer hover:opacity-90 active:scale-95 transition-all text-center">
                  <Upload className="w-3.5 h-3.5" />
                  {isProcessingImg ? 'Compressing…' : 'Upload / Take Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFile}
                    className="sr-only"
                  />
                </label>
                {imageError && (
                  <p role="alert" className="text-[11.5px] font-semibold text-red-600">
                    {imageError}
                  </p>
                )}
                <div className="flex items-center gap-1.5">
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Or paste image URL (Unsplash, etc.)"
                    className="flex-1 bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[11.5px] focus:outline-none focus:border-[var(--lagoon)]"
                  />
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={handleManualDetectTrigger}
                      disabled={isDetectingAI}
                      className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--line)] text-[11px] font-bold text-[var(--ink)] flex items-center gap-1 disabled:opacity-50"
                      title="Run AI detection on this image"
                    >
                      <Sparkles className="w-3 h-3 text-[var(--palm)]" />
                      Detect
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Plant Names */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-bold text-[var(--ink)]">Common Name *</label>
                {aiDetectionNotice && <span className="text-[9.5px] font-bold text-[var(--palm)] bg-[var(--palm)]/10 px-1.5 py-0.5 rounded">AI Auto-filled</span>}
              </div>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Blue Latan Palm"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--lagoon)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Nombre común en español (optional, verified)</label>
              <input
                type="text"
                value={nameEs}
                onChange={(e) => setNameEs(e.target.value)}
                placeholder="e.g. Palma azul"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--lagoon)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-bold text-[var(--ink)]">Scientific Name</label>
                {aiDetectionNotice && <span className="text-[9.5px] font-bold text-[var(--palm)] bg-[var(--palm)]/10 px-1.5 py-0.5 rounded">AI Auto-filled</span>}
              </div>
              <input
                type="text"
                value={sci}
                onChange={(e) => setSci(e.target.value)}
                placeholder="e.g. Latania loddigesii"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] italic focus:outline-none focus:border-[var(--lagoon)]"
              />
            </div>
          </div>

          {/* Category & Kind */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              >
                <option value="Palms">Palms</option>
                <option value="Shrubs">Shrubs</option>
                <option value="Flowers">Flowers</option>
                <option value="Grasses">Grasses</option>
                <option value="Trees">Trees</option>
                <option value="Groundcover">Groundcover</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Botanical Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              >
                <option value="palm">Palm</option>
                <option value="shrub">Shrub</option>
                <option value="flower">Flower</option>
                <option value="grass">Grass / Sod</option>
              </select>
            </div>
          </div>

          {/* Pricing & Pot Size */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Price *</label>
              <input
                type="number"
                min="0"
                step="5"
                required
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as any)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              >
                <option value="HNL">HNL (L)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Size / Pot</label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="5 Gallon"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-2 text-[13px]"
              />
            </div>
          </div>

          {kind === 'grass' && <div className="rounded-2xl border border-[var(--line)] p-3 flex flex-col gap-2">
            <p className="text-[12px] font-bold">{lang === 'es' ? 'Cobertura para cálculos de césped' : 'Sod-estimator coverage'}</p>
            <p className="text-[10px] text-[var(--ink-soft)]">{lang === 'es' ? 'Registra la superficie que cubre cada losa o unidad, según el proveedor.' : 'Record the surface covered by each slab or unit, as confirmed by the supplier.'}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold">{lang === 'es' ? 'Cobertura por unidad (m²)' : 'Coverage per unit (m²)'}
                <input type="number" min="0" step="0.001" value={coverageAreaM2} onChange={e=>setCoverageAreaM2(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-sm" />
              </label>
              <label className="text-[11px] font-semibold">{lang === 'es' ? 'Nombre de unidad' : 'Unit label'}
                <input type="text" maxLength={60} value={materialUnitLabel} onChange={e=>setMaterialUnitLabel(e.target.value)} placeholder={lang === 'es' ? 'Ej. losa de 1 yd²' : 'e.g. 1 sq yd slab'} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-sm" />
              </label>
            </div>
          </div>}

          {/* Inventory & Stock Quantity */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Stock Status</label>
              <select
                value={stock}
                onChange={(e) => setStock(e.target.value as any)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              >
                <option value="In stock">In stock</option>
                <option value="Low stock">Low stock</option>
                <option value="Out of stock">Out of stock</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Quantity on Hand</label>
              <input
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => {
                  const qty = Number(e.target.value);
                  setStockQuantity(qty);
                  if (qty <= 0) setStock('Out of stock');
                  else if (qty <= 5) setStock('Low stock');
                  else setStock('In stock');
                }}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              />
            </div>
          </div>

          {/* Environmental Hardiness Parameters */}
          <div className="grid grid-cols-3 gap-2 bg-[var(--surface-2)] p-2.5 rounded-2xl">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                Salt Spray (1-3)
              </label>
              <select
                value={salt}
                onChange={(e) => setSalt(Number(e.target.value))}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2 py-1.5 text-[12.5px] font-bold"
              >
                <option value={3}>3 - Extreme Beachfront</option>
                <option value={2}>2 - Moderate Coastal</option>
                <option value={1}>1 - Sheltered Valley</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                Pet Safety
              </label>
              <select
                value={pet}
                onChange={(e) => setPet(e.target.value as any)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2 py-1.5 text-[12.5px] font-bold"
              >
                <option value="safe">Pet Safe</option>
                <option value="check">Check Toxicities</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                Native Island?
              </label>
              <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={native}
                  onChange={(e) => setNative(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--palm)]"
                />
                <span className="text-[12px] font-bold text-[var(--ink)]">Bay Islands</span>
              </label>
            </div>
          </div>

          {/* Sun & Water instructions */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-bold text-[var(--ink)]">Sunlight Requirement</label>
                {aiDetectionNotice && <span className="text-[9.5px] font-bold text-[var(--palm)] bg-[var(--palm)]/10 px-1.5 py-0.5 rounded">AI Auto-filled</span>}
              </div>
              <input
                type="text"
                value={sun}
                onChange={(e) => setSun(e.target.value)}
                placeholder="Full tropical sun"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-bold text-[var(--ink)]">Watering Needs</label>
                {aiDetectionNotice && <span className="text-[9.5px] font-bold text-[var(--palm)] bg-[var(--palm)]/10 px-1.5 py-0.5 rounded">AI Auto-filled</span>}
              </div>
              <input
                type="text"
                value={water}
                onChange={(e) => setWater(e.target.value)}
                placeholder="Every 3 days"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px]"
              />
            </div>
          </div>

          {/* Supplier & Location Registered Select (Pop box) */}
          <div className="flex flex-col gap-1.5 bg-[var(--surface-2)] p-2.5 rounded-2xl border border-[var(--line)]">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[var(--palm)]" />
                Registered Supplier & Nursery Bed *
              </label>
              <button
                type="button"
                onClick={() => setShowAddSupplierInline((prev) => !prev)}
                className="text-[11.5px] font-bold text-[var(--palm)] hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                {showAddSupplierInline ? 'Cancel' : 'New Supplier'}
              </button>
            </div>

            {/* Pop box select from registered suppliers */}
            <select
              required
              value={nursery}
              onChange={(e) => {
                if (e.target.value === '__ADD_NEW__') {
                  setShowAddSupplierInline(true);
                } else {
                  setNursery(e.target.value);
                }
              }}
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px] font-medium focus:outline-none focus:border-[var(--lagoon)]"
            >
              <option value="">-- Select from Registered Suppliers --</option>
              {registeredSuppliers.map((s) => {
                const val = `${s.name} (${s.location})`;
                return (
                  <option key={s.id} value={val}>
                    {s.name} — {s.location}
                  </option>
                );
              })}
              <option value="__ADD_NEW__">+ Register New Supplier / Location...</option>
            </select>

            {/* Inline Quick Add for Supplier & Location */}
            {showAddSupplierInline && (
              <div className="mt-2 p-2.5 bg-[var(--surface)] rounded-xl border border-[var(--palm)] flex flex-col gap-2 animate-in fade-in duration-150">
                <span className="text-[11.5px] font-extrabold text-[var(--palm)]">
                  Register New Supplier / Bed Location
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newSupName}
                    onChange={(e) => setNewSupName(e.target.value)}
                    placeholder="Business Name (e.g. Maya Palm)"
                    className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-[12px]"
                  />
                  <input
                    type="text"
                    value={newSupLocation}
                    onChange={(e) => setNewSupLocation(e.target.value)}
                    placeholder="Island Location (e.g. French Cay)"
                    className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-[12px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateSupplier}
                  disabled={!newSupName.trim() || !newSupLocation.trim()}
                  className="py-1.5 px-3 rounded-lg bg-[var(--palm)] text-white text-[12px] font-bold self-end disabled:opacity-50"
                >
                  Register & Select
                </button>
              </div>
            )}
          </div>

          {/* Description & Notes */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-bold text-[var(--ink)]">Botanical Notes / Description</label>
              {aiDetectionNotice && <span className="text-[9.5px] font-bold text-[var(--palm)] bg-[var(--palm)]/10 px-1.5 py-0.5 rounded">AI Auto-filled</span>}
            </div>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Foliage traits, landscaping suitability, growth habits on Roatán limestone soils…"
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px]"
            />
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-bold text-[var(--ink)]">Search Tags (comma-separated)</label>
              {aiDetectionNotice && <span className="text-[9.5px] font-bold text-[var(--palm)] bg-[var(--palm)]/10 px-1.5 py-0.5 rounded">AI Auto-filled</span>}
            </div>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="palm, hedge, privacy, native"
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px]"
            />
          </div>

          {saveError && (
            <p role="alert" className="text-[12.5px] font-semibold text-red-600 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
              {saveError}
            </p>
          )}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 rounded-2xl bg-[var(--surface-2)] text-[var(--ink)] font-bold text-[14px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || isProcessingImg}
              className="flex-1 py-3 rounded-2xl bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[14px] shadow-xs active:scale-98 transition-all disabled:opacity-60 disabled:cursor-wait"
            >
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Catalog Plant Specimen'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
