import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchMyServiceRequests, respondToServiceQuote } from '../services/api';
import { SERVICE_STATUS_STYLES, serviceStatusLabel } from '../data/serviceRequests';
import { Language, ServiceRequest } from '../types';

interface Props {
  lang: Language;
  accessToken: string;
}

/** The signed-in customer's own landscaping requests, with accept / decline for an open quote. */
export const MyServiceRequests: React.FC<Props> = ({ lang, accessToken }) => {
  const es = lang === 'es';
  const [rows, setRows] = useState<ServiceRequest[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchMyServiceRequests(accessToken));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your requests.');
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (id: string, accept: boolean) => {
    setBusyId(id);
    setError('');
    try {
      await respondToServiceQuote(accessToken, id, accept);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your response could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  if (rows === null && !error) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[var(--ink-soft)]">
        <Loader2 className="w-4 h-4 animate-spin" /> {es ? 'Cargando solicitudes…' : 'Loading your landscaping requests…'}
      </div>
    );
  }
  if (!error && rows && rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-[16px] font-extrabold text-[var(--ink)]">
        {es ? 'Mis solicitudes de paisajismo' : 'My landscaping requests'}
      </h2>
      {error && <p role="alert" className="text-[12.5px] font-semibold text-red-600">{error}</p>}
      {rows?.map((r) => {
        const canRespond = r.status === 'quote_sent' || r.status === 'awaiting_response';
        return (
          <div key={r.id} className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <b className="text-[13.5px] text-[var(--ink)]">{r.request_number}</b>
              <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${SERVICE_STATUS_STYLES[r.status]}`}>
                {serviceStatusLabel(r.status, lang)}
              </span>
            </div>
            <div className="text-[13px] text-[var(--ink)]">{r.service_type} · {r.location}</div>
            {r.assigned_landscaper_name && (
              <small className="text-[12px] text-[var(--ink-soft)]">
                {es ? 'Paisajista' : 'Landscaper'}: {r.assigned_landscaper_name}
              </small>
            )}
            {r.quote_amount != null && r.quote_sent_at && (
              <div className="text-[13px] font-bold text-[var(--palm)]">
                {es ? 'Cotización' : 'Quote'}: {r.quote_amount} {r.quote_currency}
                {r.quote_notes ? <span className="font-normal text-[var(--ink-soft)]"> — {r.quote_notes}</span> : null}
              </div>
            )}
            {r.customer_response && (
              <small className="text-[12px] text-[var(--ink-soft)]">{es ? 'Tu respuesta' : 'Your response'}: {r.customer_response}</small>
            )}
            {canRespond && (
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => respond(r.id, true)}
                  className="flex-1 min-h-[40px] bg-[var(--palm)] text-white text-[13px] font-bold rounded-xl disabled:opacity-50"
                >
                  {es ? 'Aceptar' : 'Accept'}
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => respond(r.id, false)}
                  className="flex-1 min-h-[40px] border border-[var(--line)] text-[var(--ink)] text-[13px] font-bold rounded-xl disabled:opacity-50"
                >
                  {es ? 'Rechazar' : 'Decline'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
