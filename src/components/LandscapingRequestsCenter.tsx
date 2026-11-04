import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import {
  AdminServiceRequestUpdate,
  adminUpdateServiceRequest,
  fetchAdminServiceRequests,
  fetchServiceRequestEvents
} from '../services/api';
import {
  SERVICE_STATUS_ORDER,
  SERVICE_STATUS_STYLES,
  serviceStatusLabel,
  whatsappNumber
} from '../data/serviceRequests';
import { Landscaper, Language, ServiceRequest, ServiceRequestEvent, ServiceRequestStatus } from '../types';

interface Props {
  lang: Language;
  accessToken?: string;
  landscapers: Landscaper[];
  adminName?: string;
  /** Reports how many requests are still "new" so the admin tab can show a badge. */
  onNewCount?: (count: number) => void;
}

const input = 'w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[13px]';
const label = 'text-[11px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]';
const btn = 'px-3 py-2 rounded-xl bg-[var(--palm)] text-white text-[12.5px] font-bold disabled:opacity-50 active:scale-95 transition-all';

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

export const LandscapingRequestsCenter: React.FC<Props> = ({ lang, accessToken, landscapers, adminName, onNewCount }) => {
  const es = lang === 'es';
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'open' | 'all' | ServiceRequestStatus>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<ServiceRequestEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  // Action forms
  const [statusPick, setStatusPick] = useState<ServiceRequestStatus>('pending_review');
  const [assignPick, setAssignPick] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState<'USD' | 'HNL'>('USD');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [logChannel, setLogChannel] = useState<'whatsapp' | 'phone' | 'email' | 'in_person' | 'note'>('whatsapp');
  const [logDirection, setLogDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [logText, setLogText] = useState('');

  const selected = useMemo(() => requests.find((r) => r.id === selectedId) || null, [requests, selectedId]);

  const load = useCallback(async () => {
    if (!accessToken) {
      setError(es ? 'Inicia sesión como administrador.' : 'Administrator sign-in is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await fetchAdminServiceRequests(accessToken);
      setRequests(rows);
      onNewCount?.(rows.filter((r) => r.status === 'new_request').length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load landscaping requests.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, es, onNewCount]);

  const loadEvents = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      try {
        setEvents(await fetchServiceRequestEvents(accessToken, id));
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Could not load project history.');
      }
    },
    [accessToken]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setActionError('');
    setLogText('');
    setStatusNote('');
    if (selected) {
      setStatusPick(selected.status);
      setAssignPick(selected.assigned_landscaper_ref || '');
      setQuoteAmount(selected.quote_amount != null ? String(selected.quote_amount) : '');
      setQuoteCurrency(selected.quote_currency || selected.currency || 'USD');
      setQuoteNotes(selected.quote_notes || '');
      loadEvents(selected.id);
    } else {
      setEvents([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [requests]);

  const visible = requests.filter((r) =>
    filter === 'all' ? true : filter === 'open' ? r.status !== 'completed' && r.status !== 'cancelled' : r.status === filter
  );

  const run = async (update: AdminServiceRequestUpdate, after?: () => void) => {
    if (!accessToken || !selected) return;
    setBusy(true);
    setActionError('');
    try {
      await adminUpdateServiceRequest(accessToken, selected.id, { ...update, actorName: adminName || 'Administrator' });
      after?.();
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The update failed.');
    } finally {
      setBusy(false);
    }
  };

  const assign = () => {
    const crew = landscapers.find((l) => l.id === assignPick);
    if (!crew) {
      run({ clearAssignment: true });
      return;
    }
    run({ assignedRef: crew.id, assignedName: crew.name });
  };

  const logCommunication = () => {
    if (!logText.trim()) return;
    run(
      {
        note: logText,
        channel: logChannel === 'note' ? null : logChannel,
        direction: logChannel === 'note' ? 'internal' : logDirection
      },
      () => setLogText('')
    );
  };

  const wa = selected
    ? `https://wa.me/${whatsappNumber(selected.customer_phone)}?text=${encodeURIComponent(
        `Hello ${selected.customer_name || ''}, this is Verde Roatán about your landscaping request ${selected.request_number || ''}.`
      )}`
    : '#';

  const filters: Array<{ id: 'open' | 'all' | ServiceRequestStatus; text: string }> = [
    { id: 'open', text: es ? 'Abiertas' : 'Open' },
    ...SERVICE_STATUS_ORDER.map((s) => ({ id: s, text: serviceStatusLabel(s, lang) })),
    { id: 'all', text: es ? 'Todas' : 'All' }
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <b className="text-[15px] text-[var(--ink)] font-extrabold">{es ? 'Solicitudes de paisajismo' : 'Landscaping requests'}</b>
          <small className="block text-[11.5px] text-[var(--ink-soft)]">
            {es ? 'Separadas de los pedidos de productos.' : 'Kept separate from product orders.'}
          </small>
        </div>
        <button type="button" onClick={load} disabled={loading} className="p-2 rounded-xl border border-[var(--line)] text-[var(--ink-soft)]" aria-label="Refresh">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[11.5px] font-bold border ${
              filter === f.id ? 'bg-[var(--palm)] text-white border-[var(--palm)]' : 'border-[var(--line)] text-[var(--ink-soft)]'
            }`}
          >
            {f.text}
            {f.id !== 'open' && f.id !== 'all' && counts[f.id] ? ` (${counts[f.id]})` : ''}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-[12.5px] font-semibold text-red-600">{error}</p>}
      {!error && !loading && visible.length === 0 && (
        <p className="text-[13px] text-[var(--ink-soft)] bg-[var(--surface-2)] rounded-2xl p-4 text-center">
          {es ? 'No hay solicitudes en esta vista.' : 'No requests in this view.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((r) => {
          const open = r.id === selectedId;
          return (
            <div key={r.id} className="border border-[var(--line)] rounded-2xl bg-[var(--surface)]">
              <button
                type="button"
                onClick={() => setSelectedId(open ? null : r.id)}
                className="w-full flex items-start justify-between gap-2 p-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="text-[13.5px] text-[var(--ink)]">{r.request_number || 'LS'}</b>
                    <span className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${SERVICE_STATUS_STYLES[r.status]}`}>
                      {serviceStatusLabel(r.status, lang)}
                    </span>
                  </div>
                  <div className="text-[13px] text-[var(--ink)] truncate">{r.customer_name || '—'} · {r.service_type}</div>
                  <small className="text-[11.5px] text-[var(--ink-soft)]">
                    {r.location || '—'} · {fmt(r.created_at)}
                    {r.assigned_landscaper_name ? ` · ${r.assigned_landscaper_name}` : ''}
                  </small>
                </div>
                {open ? <ChevronUp className="w-4 h-4 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 shrink-0 mt-1" />}
              </button>

              {open && (
                <div className="border-t border-[var(--line)] p-3 flex flex-col gap-3.5">
                  {/* Customer + project */}
                  <section className="flex flex-col gap-1.5">
                    <span className={label}>{es ? 'Cliente y proyecto' : 'Customer & project'}</span>
                    <div className="text-[13px] text-[var(--ink)]">{r.customer_name} {r.customer_email ? `· ${r.customer_email}` : ''}</div>
                    <div className="flex gap-2 flex-wrap">
                      {r.customer_phone && (
                        <>
                          <a href={`tel:${r.customer_phone}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--line)] text-[12.5px] font-bold">
                            <Phone className="w-3.5 h-3.5" /> {r.customer_phone}
                          </a>
                          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] text-white text-[12.5px] font-bold">
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </a>
                        </>
                      )}
                    </div>
                    <p className="text-[13px] text-[var(--ink)] whitespace-pre-wrap">{r.description}</p>
                    <small className="text-[11.5px] text-[var(--ink-soft)]">
                      {es ? 'Ubicación' : 'Location'}: {r.location || '—'} · {es ? 'Plazo' : 'Timing'}: {r.requested_timing || '—'}
                      {r.requested_date ? ` · ${es ? 'Fecha' : 'Date'}: ${r.requested_date}` : ''}
                      {r.requested_landscaper_name ? ` · ${es ? 'Pidió a' : 'Asked for'}: ${r.requested_landscaper_name}` : ''}
                    </small>
                    {r.customer_response && (
                      <small className="text-[12px] text-[var(--ink)] bg-[var(--surface-2)] rounded-lg px-2 py-1">
                        {es ? 'Respuesta del cliente' : 'Customer response'}: {r.customer_response}
                      </small>
                    )}
                  </section>

                  {/* Status */}
                  <section className="flex flex-col gap-1.5">
                    <span className={label}>{es ? 'Estado del proyecto' : 'Project status'}</span>
                    <div className="flex gap-2">
                      <select className={input} value={statusPick} onChange={(e) => setStatusPick(e.target.value as ServiceRequestStatus)}>
                        {SERVICE_STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>{serviceStatusLabel(s, lang)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || statusPick === r.status}
                        className={btn}
                        onClick={() => run({ status: statusPick, note: statusNote || undefined }, () => setStatusNote(''))}
                      >
                        {es ? 'Actualizar' : 'Update'}
                      </button>
                    </div>
                    <input
                      className={input}
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder={es ? 'Nota (motivo de cancelación, retraso…)' : 'Note (cancellation reason, delay…)'}
                    />
                  </section>

                  {/* Assignment */}
                  <section className="flex flex-col gap-1.5">
                    <span className={label}>
                      {es ? 'Paisajista asignado' : 'Assigned landscaper'}: {r.assigned_landscaper_name || (es ? 'ninguno' : 'none')}
                    </span>
                    <div className="flex gap-2">
                      <select className={input} value={assignPick} onChange={(e) => setAssignPick(e.target.value)}>
                        <option value="">{es ? '— Sin asignar —' : '— Unassigned —'}</option>
                        {landscapers.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || assignPick === (r.assigned_landscaper_ref || '')}
                        className={btn}
                        onClick={assign}
                      >
                        {r.assigned_landscaper_name ? (es ? 'Reasignar' : 'Reassign') : es ? 'Asignar' : 'Assign'}
                      </button>
                    </div>
                  </section>

                  {/* Quote */}
                  <section className="flex flex-col gap-1.5">
                    <span className={label}>{es ? 'Cotización' : 'Quote'}</span>
                    <div className="flex gap-2">
                      <input
                        className={input}
                        inputMode="decimal"
                        value={quoteAmount}
                        onChange={(e) => setQuoteAmount(e.target.value)}
                        placeholder="0.00"
                      />
                      <select className={`${input} !w-24`} value={quoteCurrency} onChange={(e) => setQuoteCurrency(e.target.value as 'USD' | 'HNL')}>
                        <option value="USD">USD</option>
                        <option value="HNL">HNL</option>
                      </select>
                    </div>
                    <input className={input} value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} placeholder={es ? 'Alcance / notas de la cotización' : 'Scope / quote notes'} />
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={busy || !quoteAmount || Number.isNaN(Number(quoteAmount)) || Number(quoteAmount) < 0}
                        className={btn}
                        onClick={() => run({ quoteAmount: Number(quoteAmount), quoteCurrency, quoteNotes: quoteNotes || undefined })}
                      >
                        {es ? 'Guardar cotización' : 'Save quote'}
                      </button>
                      <button
                        type="button"
                        disabled={busy || r.status === 'quote_sent' || (!r.quote_amount && !quoteAmount)}
                        className={`${btn} !bg-violet-600`}
                        onClick={() =>
                          run({
                            status: 'quote_sent',
                            ...(quoteAmount ? { quoteAmount: Number(quoteAmount), quoteCurrency, quoteNotes: quoteNotes || undefined } : {})
                          })
                        }
                      >
                        {es ? 'Marcar como enviada' : 'Mark quote sent'}
                      </button>
                    </div>
                    {r.quote_amount != null && (
                      <small className="text-[11.5px] text-[var(--ink-soft)]">
                        {es ? 'Guardada' : 'Saved'}: {r.quote_amount} {r.quote_currency}
                        {r.quote_sent_at ? ` · ${es ? 'enviada' : 'sent'} ${fmt(r.quote_sent_at)}` : ''}
                      </small>
                    )}
                  </section>

                  {/* Communication */}
                  <section className="flex flex-col gap-1.5">
                    <span className={label}>{es ? 'Registrar comunicación' : 'Record communication'}</span>
                    <div className="flex gap-2">
                      <select className={input} value={logChannel} onChange={(e) => setLogChannel(e.target.value as typeof logChannel)}>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="phone">{es ? 'Llamada' : 'Phone call'}</option>
                        <option value="email">Email</option>
                        <option value="in_person">{es ? 'En persona' : 'In person'}</option>
                        <option value="note">{es ? 'Nota interna' : 'Internal note'}</option>
                      </select>
                      {logChannel !== 'note' && (
                        <select className={input} value={logDirection} onChange={(e) => setLogDirection(e.target.value as 'outbound' | 'inbound')}>
                          <option value="outbound">{es ? 'Enviado' : 'Sent to customer'}</option>
                          <option value="inbound">{es ? 'Recibido' : 'From customer'}</option>
                        </select>
                      )}
                    </div>
                    <textarea className={input} rows={2} value={logText} onChange={(e) => setLogText(e.target.value)} placeholder={es ? 'Qué se dijo o acordó…' : 'What was said or agreed…'} />
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" disabled={busy || !logText.trim()} className={btn} onClick={logCommunication}>
                        {es ? 'Guardar en el historial' : 'Save to history'}
                      </button>
                      {logChannel !== 'note' && logDirection === 'inbound' && (
                        <button
                          type="button"
                          disabled={busy || !logText.trim()}
                          className={`${btn} !bg-sky-600`}
                          onClick={() => run({ customerResponse: logText, channel: logChannel as 'whatsapp' | 'phone' | 'email' | 'in_person' }, () => setLogText(''))}
                        >
                          {es ? 'Guardar como respuesta del cliente' : 'Save as customer response'}
                        </button>
                      )}
                    </div>
                  </section>

                  {actionError && <p role="alert" className="text-[12.5px] font-semibold text-red-600">{actionError}</p>}

                  {/* History */}
                  <section className="flex flex-col gap-1.5">
                    <span className={label}>{es ? 'Historial del proyecto' : 'Project history'}</span>
                    {events.length === 0 ? (
                      <small className="text-[12px] text-[var(--ink-soft)]">{es ? 'Sin eventos todavía.' : 'No events yet.'}</small>
                    ) : (
                      <ol className="flex flex-col gap-1.5">
                        {events.map((ev) => (
                          <li key={ev.id} className="text-[12px] border-l-2 border-[var(--line)] pl-2">
                            <div className="text-[var(--ink)]">
                              {ev.to_status && ev.event_type !== 'customer_response'
                                ? `${ev.from_status ? serviceStatusLabel(ev.from_status, lang) + ' → ' : ''}${serviceStatusLabel(ev.to_status, lang)}`
                                : ev.message}
                              {ev.to_status && ev.message && ev.event_type !== 'created' ? ` — ${ev.message}` : ''}
                            </div>
                            <small className="text-[var(--ink-soft)]">
                              {fmt(ev.created_at)} · {ev.actor_name || ev.actor_role}
                              {ev.channel ? ` · ${ev.channel}` : ''}
                              {ev.is_internal ? ` · ${es ? 'interno' : 'internal'}` : ''}
                            </small>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
