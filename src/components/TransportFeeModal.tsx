import React, { useState } from 'react';
import { Check, DollarSign, MapPin, Save, Truck, X } from 'lucide-react';
import { DeliveryZone, Language } from '../types';

interface TransportFeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  zones: DeliveryZone[];
  selectedZoneId: string;
  onUpdateZoneFee: (zoneId: string, newFee: number, currency: 'USD' | 'HNL') => void;
  lang: Language;
  exchangeRateHnl: number;
}

export const TransportFeeModal: React.FC<TransportFeeModalProps> = ({
  isOpen,
  onClose,
  zones,
  selectedZoneId,
  onUpdateZoneFee,
  lang,
  exchangeRateHnl
}) => {
  const [activeZoneId, setActiveZoneId] = useState(selectedZoneId || zones[0]?.id || 'z-we');
  const currentZone = zones.find((z) => z.id === activeZoneId) || zones[0];

  const [feeInput, setFeeInput] = useState<string>(() => String(currentZone?.fee ?? 10));
  const [currencyInput, setCurrencyInput] = useState<'USD' | 'HNL'>(() => currentZone?.currency ?? 'USD');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync state when switching zone
  const handleSelectZone = (zone: DeliveryZone) => {
    setActiveZoneId(zone.id);
    setFeeInput(String(zone.fee));
    setCurrencyInput(zone.currency);
    setSavedSuccess(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedFee = parseFloat(feeInput);
    if (isNaN(parsedFee) || parsedFee < 0) return;

    onUpdateZoneFee(activeZoneId, parsedFee, currencyInput);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] rounded-3xl w-full max-w-lg p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-[var(--palm)]/15 text-[var(--palm)] flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-[18px] font-extrabold text-[var(--ink)] leading-tight">
                {lang === 'es' ? 'Ajustar Tarifa de Transporte' : 'Manage Transport Fees'}
              </h2>
              <small className="text-[12px] text-[var(--palm)] font-bold">
                Admin Island Delivery Controls
              </small>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[var(--surface-2)] text-[var(--ink-soft)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Zone Selector Tabs */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
            {lang === 'es' ? 'Seleccionar Zona de Roatán' : 'Select Roatán Delivery Zone'}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-[160px] overflow-y-auto p-1 bg-[var(--surface-2)] rounded-2xl">
            {zones.map((z) => {
              const isSelected = z.id === activeZoneId;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => handleSelectZone(z)}
                  className={`p-2 rounded-xl text-left transition-all text-[12px] flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[var(--palm)] text-white font-bold shadow-xs'
                      : 'bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--palm)] border border-transparent'
                  }`}
                >
                  <span className="truncate font-semibold">{z.name}</span>
                  <span className={`text-[11px] font-extrabold mt-0.5 ${isSelected ? 'text-white/90' : 'text-[var(--palm)]'}`}>
                    {z.currency === 'USD' ? `$${z.fee}` : `L ${z.fee}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fee Edit Form */}
        <form onSubmit={handleSave} className="flex flex-col gap-4 bg-[var(--surface-2)] p-4 rounded-2xl border border-[var(--line)]">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--lagoon)]" />
            <b className="text-[15px] text-[var(--ink)]">{currentZone?.name}</b>
            <span className="text-[11.5px] text-[var(--ink-soft)]">({currentZone?.description || 'Island Zone'})</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Amount */}
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">
                {lang === 'es' ? 'Nueva Tarifa' : 'Transport Fee'}
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                required
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[15px] font-extrabold text-[var(--ink)] tabular-nums"
              />
            </div>

            {/* Currency */}
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">
                {lang === 'es' ? 'Moneda' : 'Currency'}
              </label>
              <select
                value={currencyInput}
                onChange={(e) => setCurrencyInput(e.target.value as 'USD' | 'HNL')}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[14px] font-bold text-[var(--ink)]"
              >
                <option value="USD">USD ($)</option>
                <option value="HNL">HNL (L)</option>
              </select>
            </div>
          </div>

          {/* Conversion preview */}
          <div className="text-[12px] text-[var(--ink-soft)] flex items-center justify-between pt-1 border-t border-[var(--line)]">
            <span>
              {lang === 'es' ? 'Equivalente aproximado:' : 'Approximate conversion:'}
            </span>
            <b className="text-[var(--ink)]">
              {currencyInput === 'USD'
                ? `L ${(parseFloat(feeInput || '0') * exchangeRateHnl).toFixed(0)} HNL`
                : `$${(parseFloat(feeInput || '0') / exchangeRateHnl).toFixed(2)} USD`}
            </b>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 min-h-[44px] bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[14px] rounded-xl shadow-xs active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>{lang === 'es' ? '¡Tarifa Guardada!' : 'Fee Updated!'}</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{lang === 'es' ? 'Guardar Tarifa' : 'Save Transport Fee'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] font-bold text-[13px] hover:bg-[var(--surface-2)]"
            >
              {lang === 'es' ? 'Cerrar' : 'Close'}
            </button>
          </div>
        </form>

        {/* Overview table of all zones */}
        <div className="flex flex-col gap-1.5 pt-1">
          <small className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
            {lang === 'es' ? 'Resumen de Tarifas por Zona' : 'All Island Delivery Zones & Transport Rates'}
          </small>
          <div className="flex flex-col divide-y divide-[var(--line)] max-h-[180px] overflow-y-auto bg-[var(--surface-2)] rounded-2xl px-3 border border-[var(--line)]">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between py-2 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--palm)]" />
                  <span className="font-semibold">{z.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <b className="font-bold text-[var(--ink)]">
                    {z.currency === 'USD' ? `$${z.fee}` : `L ${z.fee}`}
                  </b>
                  <button
                    type="button"
                    onClick={() => handleSelectZone(z)}
                    className="text-[11px] font-bold text-[var(--palm)] hover:underline"
                  >
                    {lang === 'es' ? 'Editar' : 'Edit'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
