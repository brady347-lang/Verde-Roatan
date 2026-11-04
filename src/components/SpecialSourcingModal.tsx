import React, { useState } from 'react';
import { Building2, CheckCircle2, MessageSquare, Phone, Send, Sprout, X } from 'lucide-react';
import { DeliveryZone, Language } from '../types';

interface SpecialSourcingModalProps {
  isOpen: boolean;
  onClose: () => void;
  plantName: string;
  scientificName?: string;
  lang: Language;
  zones: DeliveryZone[];
  selectedZoneId: string;
  showToast: (msg: string) => void;
}

export const SpecialSourcingModal: React.FC<SpecialSourcingModalProps> = ({
  isOpen,
  onClose,
  plantName,
  scientificName = '',
  lang,
  zones,
  selectedZoneId,
  showToast
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+504 ');
  const [sizePreference, setSizePreference] = useState('5-7 Gallon Container');
  const [quantity, setQuantity] = useState(2);
  const [zoneId, setZoneId] = useState(selectedZoneId || (zones[0]?.id || ''));
  const [notes, setNotes] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const currentZone = zones.find((z) => z.id === zoneId) || zones[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Compose prefilled WhatsApp message to Verde Roatán Nursery Sourcing Desk
    const waText = encodeURIComponent(
      `Hello Verde Roatán! I would like to request special grower sourcing for a species not currently in your nursery catalog:\n\n` +
      `🌿 Plant: ${plantName} ${scientificName ? `(${scientificName})` : ''}\n` +
      `📏 Size: ${sizePreference}\n` +
      `🔢 Quantity: ${quantity}\n` +
      `📍 Delivery Zone: ${currentZone?.name || 'Roatan'}\n` +
      `👤 Customer: ${name.trim()} (${phone.trim()})\n` +
      (notes.trim() ? `📝 Notes: ${notes.trim()}\n` : '') +
      `\nPlease let me know availability and pricing from your partner growers.`
    );

    // Open WhatsApp in new tab / app
    window.open(`https://wa.me/50499000000?text=${waText}`, '_blank');

    setIsSubmitted(true);
    showToast(lang === 'es' ? '¡Solicitud de búsqueda enviada!' : 'Special sourcing inquiry dispatched!');
    setTimeout(() => {
      setIsSubmitted(false);
      onClose();
    }, 1800);
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--palm)]/15 text-[var(--palm)] flex items-center justify-center">
              <Sprout className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-[17px] font-extrabold text-[var(--ink)]">
                {lang === 'es' ? 'Búsqueda Especial de Planta' : 'Special Plant Sourcing'}
              </h2>
              <small className="text-[11px] text-[var(--ink-soft)] block">
                {lang === 'es'
                  ? 'Conectamos con viveristas asociados en las Islas de la Bahía'
                  : 'Sourced across partner growers in Roatán & Bay Islands'}
              </small>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)] hover:text-[var(--ink)] flex items-center justify-center font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="w-14 h-14 rounded-full bg-[var(--palm)]/15 text-[var(--palm)] flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </span>
            <b className="text-[16px] font-extrabold text-[var(--ink)]">
              {lang === 'es' ? '¡Solicitud Recibida!' : 'Inquiry Dispatched!'}
            </b>
            <p className="text-[12.5px] text-[var(--ink-soft)] max-w-[280px]">
              {lang === 'es'
                ? 'El equipo de vivero verificará disponibilidad con los productores de la isla y te contactará por WhatsApp.'
                : 'Our nursery procurement team will check availability with island growers and reach out via WhatsApp.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-3.5">
            {/* Target Specimen Card */}
            <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-0.5">
              <span className="text-[10px] font-extrabold uppercase text-[var(--palm)] tracking-wider">
                {lang === 'es' ? 'Especie Solicitada' : 'Requested Specimen'}
              </span>
              <b className="text-[14.5px] text-[var(--ink)] font-extrabold">
                {plantName}
              </b>
              {scientificName && (
                <i className="text-[12px] text-[var(--ink-soft)]">
                  {scientificName}
                </i>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[var(--ink)]">
                  {lang === 'es' ? 'Tamaño deseado' : 'Target Size'}
                </label>
                <select
                  value={sizePreference}
                  onChange={(e) => setSizePreference(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-2 text-[12.5px] font-bold"
                >
                  <option value="1-3 Gallon Starter">1-3 Gal Starter</option>
                  <option value="5-7 Gallon Container">5-7 Gal Container</option>
                  <option value="10-15 Gallon Mature">10-15 Gal Mature</option>
                  <option value="Large Field Specimen">Field Specimen (10ft+)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[var(--ink)]">
                  {lang === 'es' ? 'Cantidad' : 'Quantity'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px] font-bold"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">
                {lang === 'es' ? 'Zona de Entrega' : 'Delivery Destination'}
              </label>
              <select
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px] font-bold"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">
                {lang === 'es' ? 'Tu Nombre' : 'Your Name *'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maya Lindqvist"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">
                {lang === 'es' ? 'WhatsApp (con código)' : 'WhatsApp Phone *'}
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+504 9900-0000"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">
                {lang === 'es' ? 'Comentarios adicionales' : 'Special Notes'}
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Specific shade requirements, soil conditions, or villa entrance timing..."
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl p-2.5 text-[12.5px]"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[48px] bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[14px] rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all mt-1"
            >
              <Send className="w-4 h-4" />
              {lang === 'es' ? 'Solicitar Búsqueda a Viveristas' : 'Send Special Sourcing Request'}
            </button>
          </form>
        )}
      </div>
    </>
  );
};
