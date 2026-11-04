import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { submitServiceRequest } from '../services/api';
import { AuthSession, DeliveryZone, Landscaper, Language } from '../types';

interface LandscaperQuoteFormProps {
  crew: Landscaper;
  zones: DeliveryZone[];
  defaultZoneName?: string;
  session: AuthSession | null;
  lang: Language;
  title: string;
  submitLabel: string;
  onRequireSignIn: () => void;
  onSubmitted: (requestNumber: string | null) => void;
}

const field = 'w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[14px]';

/** Saves a landscaper request to the database. Success is shown only after the database confirms it. */
export const LandscaperQuoteForm: React.FC<LandscaperQuoteFormProps> = ({
  crew, zones, defaultZoneName, session, lang, title, submitLabel, onRequireSignIn, onSubmitted
}) => {
  const es = lang === 'es';
  const [name, setName] = useState(session?.user.full_name || '');
  const [phone, setPhone] = useState('');
  const [service, setService] = useState(crew.svc[0] || 'Landscaping');
  const [area, setArea] = useState(defaultZoneName || zones[0]?.name || '');
  const [timing, setTiming] = useState('As soon as possible');
  const [date, setDate] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!session?.access_token) {
    return (
      <div className="flex flex-col gap-3 pr-1">
        <h2 className="text-[20px] font-extrabold text-[var(--ink)] pr-8">{title}</h2>
        <p className="text-[13.5px] text-[var(--ink-soft)]">
          {es
            ? 'Inicia sesión para enviar tu solicitud. Así podrás ver la cotización y el estado de tu proyecto.'
            : 'Sign in to send your request so you can see the quote and the status of your project.'}
        </p>
        <button
          type="button"
          onClick={onRequireSignIn}
          className="w-full min-h-[48px] bg-[var(--palm)] text-white font-extrabold text-[14.5px] rounded-2xl"
        >
          {es ? 'Iniciar sesión' : 'Sign in'}
        </button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await submitServiceRequest(session.access_token, {
        customerId: session.user.id,
        customerName: name,
        customerPhone: phone,
        customerEmail: session.user.email,
        serviceType: service,
        description: details,
        location: area,
        requestedTiming: timing,
        requestedDate: date || null,
        landscaperRef: crew.id,
        landscaperName: crew.name
      });
      onSubmitted(saved.request_number);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5 pr-8">
        <h2 className="text-[20px] font-extrabold text-[var(--ink)]">{title}</h2>
        <small className="text-[12px] text-[var(--ink-soft)]">
          {es ? 'Consulta directa a' : 'Direct inquiry to'} {crew.name}
        </small>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-bold text-[var(--ink)]">{es ? 'Tu nombre' : 'Your name'}</label>
        <input className={field} required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-bold text-[var(--ink)]">WhatsApp / {es ? 'Teléfono' : 'Phone'}</label>
        <input
          className={field}
          required
          inputMode="tel"
          minLength={7}
          placeholder="+504 9999-9999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-bold text-[var(--ink)]">{es ? 'Servicio necesario' : 'Service needed'}</label>
        <select className={field} value={service} onChange={(e) => setService(e.target.value)}>
          {crew.svc.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-bold text-[var(--ink)]">{es ? 'Zona / ubicación' : 'Neighborhood / area'}</label>
        <select className={field} value={area} onChange={(e) => setArea(e.target.value)}>
          {zones.map((z) => (
            <option key={z.id} value={z.name}>{z.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-bold text-[var(--ink)]">{es ? 'Plazo' : 'Timing'}</label>
          <select className={field} value={timing} onChange={(e) => setTiming(e.target.value)}>
            <option>As soon as possible</option>
            <option>This month</option>
            <option>Flexible / Site Consultation</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-bold text-[var(--ink)]">{es ? 'Fecha deseada' : 'Preferred date'}</label>
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[12px] font-bold text-[var(--ink)]">{es ? 'Detalles del proyecto' : 'Project details'}</label>
        <textarea
          rows={3}
          required
          minLength={10}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={es ? 'Tamaño del lote, árboles, setos, problemas actuales…' : 'Lot size, desired trees, hedge length, or current issues…'}
          className={field}
        />
      </div>

      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full min-h-[48px] bg-[var(--palm)] disabled:opacity-60 text-white font-extrabold text-[14.5px] rounded-2xl shadow-xs active:scale-98 transition-all flex items-center justify-center gap-2 mt-1"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? (es ? 'Enviando…' : 'Sending…') : submitLabel}
      </button>
    </form>
  );
};
