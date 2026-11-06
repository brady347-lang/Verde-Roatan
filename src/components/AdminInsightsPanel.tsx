import { useEffect, useMemo, useState } from 'react';
import { ActiveOrder, Language, ServiceRequest } from '../types';
import { fetchAdminServiceRequests } from '../services/api';
import { CountRow, ordersByStatus, salesByDay, topProducts, totals } from '../lib/insights';

interface Props {
  lang: Language;
  orders: ActiveOrder[];
  exchangeRateHnl: number;
  accessToken?: string;
}

const card = 'rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 flex flex-col gap-2 min-w-0';

function Bars({ rows, empty }: { rows: CountRow[]; empty: string }) {
  if (!rows.length) return <p className="text-[12px] text-[var(--ink-soft)]">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--ink)]">
            <span className="min-w-0 truncate capitalize">{r.label}</span>
            <b className="tabular-nums">{r.value}</b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full bg-[var(--palm)]" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AdminInsightsPanel({ lang, orders, exchangeRateHnl, accessToken }: Props) {
  const es = lang === 'es';
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetchAdminServiceRequests(accessToken)
      .then((rows) => { if (!cancelled) setRequests(rows); })
      .catch(() => { if (!cancelled) setRequestsError(es ? 'No se pudieron cargar las solicitudes.' : 'Could not load landscaping requests.'); });
    return () => { cancelled = true; };
  }, [accessToken, es]);

  const sum = useMemo(() => totals(orders, exchangeRateHnl), [orders, exchangeRateHnl]);
  const days = useMemo(() => salesByDay(orders, range, exchangeRateHnl), [orders, range, exchangeRateHnl]);
  const statuses = useMemo(() => ordersByStatus(orders), [orders]);
  const products = useMemo(() => topProducts(orders), [orders]);
  const requestRows = useMemo<CountRow[]>(() => {
    const counts = new Map<string, number>();
    (requests || []).forEach((r) => counts.set(r.status, (counts.get(r.status) || 0) + 1));
    return [...counts].map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), value })).sort((a, b) => b.value - a.value);
  }, [requests]);

  const maxDay = Math.max(...days.map((d) => d.usd), 1);
  const tile = (label: string, value: string) => (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 min-w-0">
      <small className="block text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--ink-soft)]">{label}</small>
      <b className="block truncate text-[17px] text-[var(--ink)] tabular-nums">{value}</b>
    </div>
  );

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-extrabold text-[var(--ink)]">{es ? 'Estadísticas' : 'Insights'}</h3>
        <p className="text-[12px] text-[var(--ink-soft)]">
          {es ? 'Ventas en USD (los pedidos en HNL se convierten a su tasa; sin cancelados ni reembolsados).' : 'Sales in USD (HNL orders converted at their own rate; cancelled and refunded orders left out).'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tile(es ? 'Ingresos' : 'Revenue', `$${sum.revenueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)}
        {tile(es ? 'Pedidos' : 'Orders', String(sum.orders))}
        {tile(es ? 'Promedio' : 'Average order', `$${sum.averageUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)}
        {tile(es ? 'Abiertos' : 'Open orders', String(sum.open))}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between gap-2">
          <b className="text-[13px] text-[var(--ink)]">{es ? 'Ventas por día' : 'Sales per day'}</b>
          <div className="flex gap-1">
            {([7, 14, 30] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRange(r)}
                className={`min-h-[32px] rounded-lg px-2.5 text-[11px] font-extrabold ${range === r ? 'bg-[var(--palm)] text-white' : 'bg-[var(--surface-2)] text-[var(--ink-soft)]'}`}>
                {r}d
              </button>
            ))}
          </div>
        </div>
        {days.every((d) => d.usd === 0) ? (
          <p className="text-[12px] text-[var(--ink-soft)]">{es ? 'Sin ventas en este período.' : 'No sales in this period.'}</p>
        ) : (
          <div role="img" aria-label={es ? 'Gráfica de ventas por día' : 'Sales per day chart'} className="flex h-36 items-end gap-[3px]">
            {days.map((d) => (
              <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.label}: $${d.usd} (${d.orders})`}>
                <div className="w-full rounded-t bg-[var(--palm)]" style={{ height: `${d.usd > 0 ? Math.max(3, (d.usd / maxDay) * 100) : 0}%` }} />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between text-[10px] text-[var(--ink-soft)]"><span>{days[0]?.label}</span><span>{days[days.length - 1]?.label}</span></div>
      </div>

      <div className={card}>
        <b className="text-[13px] text-[var(--ink)]">{es ? 'Pedidos por estado' : 'Orders by status'}</b>
        <Bars rows={statuses} empty={es ? 'Aún no hay pedidos.' : 'No orders yet.'} />
      </div>

      <div className={card}>
        <b className="text-[13px] text-[var(--ink)]">{es ? 'Productos más vendidos' : 'Top products'}</b>
        <Bars rows={products} empty={es ? 'Aún no hay ventas.' : 'No sales yet.'} />
      </div>

      <div className={card}>
        <b className="text-[13px] text-[var(--ink)]">{es ? 'Solicitudes de paisajismo' : 'Landscaping requests by status'}</b>
        {requestsError ? <p className="text-[12px] text-red-600">{requestsError}</p>
          : requests === null ? <p className="text-[12px] text-[var(--ink-soft)]">{es ? 'Cargando…' : 'Loading…'}</p>
          : <Bars rows={requestRows} empty={es ? 'Aún no hay solicitudes.' : 'No requests yet.'} />}
      </div>
    </section>
  );
}
