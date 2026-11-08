import React, { useState } from 'react';
import { Building2, Camera, Plus, Sparkles, Upload, X } from 'lucide-react';
import { CatalogItem, Language, RegisteredSupplier } from '../types';
import { compressImage } from '../services/api';

interface ProductEditModalProps {
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: CatalogItem) => Promise<string | null> | void;
  initialProduct?: CatalogItem | null;
  registeredSuppliers?: RegisteredSupplier[];
  onQuickAddSupplier?: (supplier: RegisteredSupplier) => void;
}

export const ProductEditModal: React.FC<ProductEditModalProps> = ({
  lang,
  isOpen,
  onClose,
  onSave,
  initialProduct,
  registeredSuppliers = [],
  onQuickAddSupplier
}) => {
  const isEditing = Boolean(initialProduct);

  const [name, setName] = useState(initialProduct?.name || '');
  const [sci, setSci] = useState(
    initialProduct?.sci || '100% Horticultural Planting Blend'
  );
  const [category, setCategory] = useState(initialProduct?.category || 'Soil & Compost');
  const [kind, setKind] = useState<'bag' | 'bottle'>((initialProduct?.kind as any) || 'bag');
  const [price, setPrice] = useState<number>(initialProduct?.price || 280);
  const [currency, setCurrency] = useState<'HNL' | 'USD'>(initialProduct?.currency || 'HNL');
  const [size, setSize] = useState(initialProduct?.size || '40 Liter Bag');
  const [packageVolumeLiters, setPackageVolumeLiters] = useState(String(initialProduct?.material_spec?.package_volume_liters || ''));
  const [coverageAreaM2, setCoverageAreaM2] = useState(String(initialProduct?.material_spec?.coverage_area_m2 || ''));
  const [materialUnitLabel, setMaterialUnitLabel] = useState(initialProduct?.material_spec?.unit_label || '');
  const [stock, setStock] = useState<'In stock' | 'Low stock' | 'Out of stock'>(
    initialProduct?.stock || 'In stock'
  );
  const [stockQuantity, setStockQuantity] = useState<number>(initialProduct?.stock_quantity ?? 30);
  const [sun, setSun] = useState(initialProduct?.sun || 'Apply according to instructions');
  const [water, setWater] = useState(initialProduct?.water || 'Standard application');
  const [pet, setPet] = useState<'safe' | 'check'>(initialProduct?.pet || 'safe');
  const [nursery, setNursery] = useState(
    initialProduct?.nursery ||
      (registeredSuppliers[0]
        ? `${registeredSuppliers[0].name} (${registeredSuppliers[0].location})`
        : 'Verde Roatán Nursery (Sandy Bay)')
  );
  const [imageUrl, setImageUrl] = useState(initialProduct?.image_url || '');
  const [note, setNote] = useState(initialProduct?.note || '');
  const [tagsInput, setTagsInput] = useState(
    initialProduct?.tags?.join(', ') || 'soil, organic, compost'
  );
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Inline supplier registration
  const [showAddSupplierInline, setShowAddSupplierInline] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupLocation, setNewSupLocation] = useState('');

  if (!isOpen) return null;

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingImg(true);
    setImageError(null);
    try {
      const base64 = await compressImage(file, 1200, 0.85);
      setImageUrl(base64);
    } catch (err) {
      console.error('Failed to compress product image', err);
      setImageError(err instanceof Error ? err.message : 'Could not process that photo. Please try another one.');
    } finally {
      setIsProcessingImg(false);
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

    const productRecord: CatalogItem = {
      id: initialProduct?.id || `prd-${Date.now()}`,
      t: 'product',
      name: name.trim(),
      sci: sci.trim(),
      category: category.trim(),
      kind,
      price: Number(price) || 0,
      currency,
      size: size.trim(),
      material_spec: Number(packageVolumeLiters) > 0 || Number(coverageAreaM2) > 0
        ? {
            ...(Number(packageVolumeLiters) > 0 ? { package_volume_liters: Number(packageVolumeLiters) } : {}),
            ...(Number(coverageAreaM2) > 0 ? { coverage_area_m2: Number(coverageAreaM2) } : {}),
            ...(materialUnitLabel.trim() ? { unit_label: materialUnitLabel.trim() } : {})
          }
        : undefined,
      stock,
      stock_quantity: Number(stockQuantity) || 0,
      salt: 1,
      sun: sun.trim(),
      water: water.trim(),
      pet,
      native_to_bay_islands: false,
      nursery: nursery.trim() || (registeredSuppliers[0] ? `${registeredSuppliers[0].name} (${registeredSuppliers[0].location})` : 'Verde Roatán Nursery'),
      image_url: imageUrl.trim() || undefined,
      note: note.trim(),
      tags: parsedTags.length > 0 ? parsedTags : [kind, 'product', category.toLowerCase()]
    };

    // Keep the form open until the database and storage steps finish, so a failure never loses the edits or photo.
    setSaving(true);
    setSaveError(null);
    let failure: string | null | void = null;
    try {
      failure = await onSave(productRecord);
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
              {isEditing ? 'Edit Nursery Product' : 'Add Nursery Product / Supply'}
            </h2>
            <small className="text-[11.5px] text-[var(--ink-soft)]">
              {isEditing ? `Modifying ${initialProduct?.name}` : 'Soil, fertilizer, pest control & yard care'}
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
          {/* Photo Preview & Upload */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-bold text-[var(--ink)]">Product Image</label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden shrink-0 flex items-center justify-center">
                {imageUrl ? (
                  <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-7 h-7 text-[var(--ink-soft)] opacity-50" />
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
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Or paste image URL"
                  className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[11.5px] focus:outline-none focus:border-[var(--lagoon)]"
                />
              </div>
            </div>
          </div>

          {/* Product Name & Subtitle */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[var(--ink)]">Product Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Island Organic Coconut Coir Medium"
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--lagoon)]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[var(--ink)]">Specification / Subtitle</label>
            <input
              type="text"
              value={sci}
              onChange={(e) => setSci(e.target.value)}
              placeholder="e.g. 100% Aerated Planting Medium (40L)"
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--lagoon)]"
            />
          </div>

          {/* Category & Packaging Type */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Category</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (e.target.value === 'Pest Control') setKind('bottle');
                  else setKind('bag');
                }}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              >
                <option value="Soil & Compost">Soil & Compost</option>
                <option value="Pest Control">Pest Control</option>
                <option value="Fertilizer">Fertilizer</option>
                <option value="Tools & Pots">Tools & Pots</option>
                <option value="Irrigation">Irrigation</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Packaging Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              >
                <option value="bag">Bag / Sack / Bucket</option>
                <option value="bottle">Bottle / Spray / Liquid</option>
              </select>
            </div>
          </div>

          {/* Price, Currency & Unit Size */}
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
              <label className="text-[12px] font-bold text-[var(--ink)]">Package Size</label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="40 Liter Bag"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-2 text-[13px]"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line)] p-3 flex flex-col gap-2">
            <p className="text-[12px] font-bold">{lang === 'es' ? 'Especificaciones para cálculos de materiales' : 'Material-estimator specifications'}</p>
            <p className="text-[10px] text-[var(--ink-soft)]">{lang === 'es' ? 'Introduce solo medidas confirmadas por el proveedor. Déjalas vacías si no se conocen.' : 'Enter only supplier-confirmed measurements. Leave blank when unknown.'}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold">{lang === 'es' ? 'Volumen por paquete (L)' : 'Volume per package (L)'}
                <input type="number" min="0" step="0.1" value={packageVolumeLiters} onChange={e=>setPackageVolumeLiters(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-sm" />
              </label>
              <label className="text-[11px] font-semibold">{lang === 'es' ? 'Cobertura por unidad (m²)' : 'Coverage per unit (m²)'}
                <input type="number" min="0" step="0.001" value={coverageAreaM2} onChange={e=>setCoverageAreaM2(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-sm" />
              </label>
            </div>
            <label className="text-[11px] font-semibold">{lang === 'es' ? 'Nombre de unidad' : 'Unit label'}
              <input type="text" maxLength={60} value={materialUnitLabel} onChange={e=>setMaterialUnitLabel(e.target.value)} placeholder={lang === 'es' ? 'Ej. saco de 40 L, adoquín' : 'e.g. 40 L bag, paver'} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-sm" />
            </label>
          </div>

          {/* Stock Status & Quantity */}
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
              <label className="text-[12px] font-bold text-[var(--ink)]">Units in Stock</label>
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

          {/* Usage & Pet Safety */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Application / Dilution</label>
              <input
                type="text"
                value={water}
                onChange={(e) => setWater(e.target.value)}
                placeholder="e.g. Dilute 1:50 with water"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Pet Safety</label>
              <select
                value={pet}
                onChange={(e) => setPet(e.target.value as any)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              >
                <option value="safe">Pet Safe</option>
                <option value="check">Keep away from pets</option>
              </select>
            </div>
          </div>

          {/* Supplier & Location Registered Select (Pop box) */}
          <div className="flex flex-col gap-1.5 bg-[var(--surface-2)] p-2.5 rounded-2xl border border-[var(--line)]">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[var(--palm)]" />
                Registered Supplier & Location *
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
                    placeholder="Business Name (e.g. Island Eco-Organics)"
                    className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-[12px]"
                  />
                  <input
                    type="text"
                    value={newSupLocation}
                    onChange={(e) => setNewSupLocation(e.target.value)}
                    placeholder="Island Location (e.g. Sandy Bay Hillside)"
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

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[var(--ink)]">Product Description & Benefits</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What makes this formulation ideal for Roatán tropical yard conditions…"
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px]"
            />
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[var(--ink)]">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="organic, fertilizer, eco-friendly"
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
              {saving ? 'Saving…' : isEditing ? 'Save Product' : 'Add to Nursery Store'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
