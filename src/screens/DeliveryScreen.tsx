import React, { useState } from 'react';
import {
  AlertCircle,
  Archive,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Coins,
  Edit2,
  ExternalLink,
  FileText,
  MapPin,
  MessageSquare,
  Minus,
  Navigation,
  PackageCheck,
  Palmtree,
  Phone,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sprout,
  Trash2,
  Truck,
  User
} from 'lucide-react';
import { ActiveOrder, CanonicalOrderStatus, CartItem, CatalogItem, DeliveryZone, Language, OrderCheckoutResult } from '../types';
import { STRINGS } from '../data/initialData';
import { ORDER_LIFECYCLE_STATUS_LABELS } from '../services/orderSystem';

interface DeliveryScreenProps {
  lang: Language;
  cart: CartItem[];
  catalog: CatalogItem[];
  zones: DeliveryZone[];
  selectedZoneId: string;
  onOpenZonePicker: () => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onNavigate: (tab: any) => void;
  onSubmitCheckout: (details: {
    name: string;
    phone: string;
    address: string;
    notes: string;
    timing: string;
    currency: 'HNL' | 'USD';
    consent: boolean;
  }) => Promise<void>;
  isSubmitting: boolean;
  orderResult: OrderCheckoutResult | null;
  onResetOrder: () => void;
  currency: 'HNL' | 'USD';
  onCurrencyChange: (c: 'HNL' | 'USD') => void;
  formatMoney: (val: number, cur: string) => React.ReactNode;
  exchangeRateHnl: number;
  activeOrders: ActiveOrder[];
  orderHistory: ActiveOrder[];
  onConfirmDelivery: (orderId: string) => void;
  onAdvanceOrderStatus?: (orderId: string) => void;
  isAdmin?: boolean;
  onOpenTransportFeeModal?: (zoneId?: string) => void;
  onSendCustomerMessage?: (orderId: string, message: string) => void;
}

export const DeliveryScreen: React.FC<DeliveryScreenProps> = ({
  lang,
  cart,
  catalog,
  zones,
  selectedZoneId,
  onOpenZonePicker,
  onUpdateQty,
  onRemoveItem,
  onNavigate,
  onSubmitCheckout,
  isSubmitting,
  currency,
  onCurrencyChange,
  formatMoney,
  exchangeRateHnl,
  activeOrders = [],
  orderHistory = [],
  onConfirmDelivery,
  onAdvanceOrderStatus,
  isAdmin = false,
  onOpenTransportFeeModal,
  onSendCustomerMessage
}) => {
  // Segmented tab inside Delivery Screen: 'cart' | 'active' | 'history'
  const [subTab, setSubTab] = useState<'cart' | 'active' | 'history'>(() => {
    if (activeOrders.length > 0 && cart.length === 0) return 'active';
    return 'cart';
  });

  const [timing, setTiming] = useState('This week');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+504 ');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});

  const t = (k: string) => STRINGS[lang]?.[k] || STRINGS.en[k] || k;

  const currentZone = zones.find((z) => z.id === selectedZoneId) || zones[0];

  const getItem = (id: string): CatalogItem => {
    const found = catalog.find((c) => String(c.id) === String(id));
    if (found) return found;
    return {
      id,
      t: 'plant',
      name: 'Island Specimen',
      sci: 'Nursery Stock',
      kind: 'palm',
      salt: 2,
      sun: 'Full sun',
      water: 'Moderate',
      price: 250,
      currency: 'HNL',
      size: 'Container',
      stock: 'In stock',
      stock_quantity: 10,
      nursery: 'Verde Roatan',
      pet: 'safe',
      tags: [],
      note: '',
      category: 'Plants'
    };
  };

  const convertVal = (val: number, fromCur: string, toCur: string) => {
    if (fromCur === toCur) return val;
    if (fromCur === 'USD' && toCur === 'HNL') return Math.round(val * exchangeRateHnl);
    if (fromCur === 'HNL' && toCur === 'USD') return Math.round((val / exchangeRateHnl) * 10) / 10;
    return val;
  };

  // Cart financial math
  const subtotal = cart.reduce((acc, ci) => {
    const item = getItem(ci.id);
    const itemPriceInCur = convertVal(item.price, item.currency, currency);
    return acc + itemPriceInCur * ci.qty;
  }, 0);

  const deliveryFee = currentZone
    ? convertVal(currentZone.fee, currentZone.currency, currency)
    : 0;
  const total = subtotal + deliveryFee;

  const toggleOrderExpand = (id: string) => {
    setExpandedOrderIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg(
        lang === 'es' ? 'Por favor ingresa tu nombre completo.' : 'Please enter your full name.'
      );
      return;
    }
    if (!address.trim()) {
      setErrorMsg(
        lang === 'es'
          ? 'Por favor ingresa la dirección de entrega de tu propiedad en la isla.'
          : 'Please enter your property delivery address on Roatán.'
      );
      return;
    }
    if (phone.replace(/\D/g, '').length < 8) {
      setErrorMsg(
        lang === 'es'
          ? 'Ingresa un número de WhatsApp válido (con código de país).'
          : 'Please enter a valid WhatsApp phone number with country code.'
      );
      return;
    }
    setErrorMsg('');
    await onSubmitCheckout({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      notes: notes.trim(),
      timing,
      currency,
      consent
    });

    // Switch view immediately to active orders so order does not disappear!
    setSubTab('active');
  };

  const getStatusBadge = (status: ActiveOrder['status']) => {
    switch (status) {
      case 'placed':
        return (
          <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {lang === 'es' ? 'Recibido por Vivero' : 'Order Placed'}
          </span>
        );
      case 'staged':
        return (
          <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Sprout className="w-3 h-3" />
            {lang === 'es' ? 'En Camas de Preparación' : 'Nursery Staged'}
          </span>
        );
      case 'en_route':
        return (
          <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 flex items-center gap-1">
            <Truck className="w-3 h-3" />
            {lang === 'es' ? 'En Ruta de Entrega' : 'Out for Island Delivery'}
          </span>
        );
      case 'delivered':
        return (
          <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-[var(--palm)]/15 text-[var(--palm)] border border-[var(--palm)]/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {lang === 'es' ? 'Entregado y Confirmado' : 'Delivered & Confirmed'}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3.5 pb-8">
      {/* Header */}
      <header className="flex flex-col gap-0.5 px-1">
        <h1 className="text-[24px] font-extrabold text-[var(--ink)] tracking-tight">
          {t('delivery')}
        </h1>
        <p className="text-[12.5px] text-[var(--ink-soft)]">
          {lang === 'es'
            ? 'Entrega directa de plantas y sustratos a villas, residencias y obras en Roatán.'
            : 'Direct nursery plant transport to villas, estates, and projects across Roatán.'}
        </p>
      </header>

      {/* Segmented Subnavigation Bar */}
      <div className="grid grid-cols-3 bg-[var(--surface-2)] p-1 rounded-2xl gap-1">
        <button
          type="button"
          onClick={() => setSubTab('cart')}
          className={`py-2 rounded-xl text-[12.5px] font-bold transition-all flex items-center justify-center gap-1.5 ${
            subTab === 'cart'
              ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
              : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5 text-[var(--palm)]" />
          <span>{t('newDeliveryReq')}</span>
          {cart.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-[var(--palm)] text-white text-[10px] font-bold flex items-center justify-center">
              {cart.reduce((a, b) => a + b.qty, 0)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('active')}
          className={`py-2 rounded-xl text-[12.5px] font-bold transition-all flex items-center justify-center gap-1.5 ${
            subTab === 'active'
              ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
              : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
          }`}
        >
          <Truck className="w-3.5 h-3.5 text-[var(--palm)]" />
          <span>{t('activeOrders')}</span>
          {activeOrders.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-[var(--palm)] text-white text-[10px] font-bold flex items-center justify-center">
              {activeOrders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('history')}
          className={`py-2 rounded-xl text-[12.5px] font-bold transition-all flex items-center justify-center gap-1.5 ${
            subTab === 'history'
              ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
              : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
          }`}
        >
          <Archive className="w-3.5 h-3.5 text-[var(--palm)]" />
          <span>{t('orderHistory')}</span>
          {orderHistory.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)] text-[10px] font-bold flex items-center justify-center border border-[var(--line)]">
              {orderHistory.length}
            </span>
          )}
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. ACTIVE ORDERS TRACKER (DOES NOT DISAPPEAR UNTIL COMPLETE)  */}
      {/* ───────────────────────────────────────────────────────────── */}
      {subTab === 'active' && (
        <div className="flex flex-col gap-3">
          {activeOrders.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-8 text-center text-[var(--ink-soft)] flex flex-col items-center gap-2.5 shadow-xs">
              <span className="w-14 h-14 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-soft)]">
                <Truck className="w-7 h-7 opacity-50" />
              </span>
              <b className="text-[15px] font-bold text-[var(--ink)]">
                {lang === 'es' ? 'No tienes entregas activas en curso' : 'No Active Island Deliveries'}
              </b>
              <p className="text-[12.5px] text-[var(--ink-soft)] max-w-[280px]">
                {lang === 'es'
                  ? 'Cuando realices un pedido de plantas, podrás rastrear la preparación en vivero y la llegada aquí mismo.'
                  : 'When you place a plant order, you can track nursery bed staging, transport, and confirm arrival here.'}
              </p>
              <button
                type="button"
                onClick={() => setSubTab('cart')}
                className="mt-2 py-2 px-4 rounded-xl bg-[var(--palm)] text-white text-[12.5px] font-bold shadow-xs active:scale-95 transition-all"
              >
                {cart.length > 0
                  ? lang === 'es' ? 'Ver Carrito de Pedido' : 'Review Cart Items'
                  : t('browseShop')}
              </button>
            </div>
          ) : (
            activeOrders.map((ord) => {
              const isExpanded = Boolean(expandedOrderIds[ord.id]);

              // 4 Step logic
              const stepIndex =
                ord.status === 'placed' ? 0 : ord.status === 'staged' ? 1 : ord.status === 'en_route' ? 2 : 3;

              return (
                <div
                  key={ord.id}
                  className="flex flex-col gap-3.5 bg-[var(--surface)] border-2 border-[var(--palm)]/50 rounded-3xl p-4.5 shadow-md"
                >
                  {/* Top Bar */}
                  <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <b className="font-mono text-[15px] text-[var(--palm)] font-bold">
                          {ord.order_id}
                        </b>
                        {getStatusBadge(ord.status)}
                      </div>
                      <small className="text-[11.5px] text-[var(--ink-soft)] block mt-0.5">
                        {new Date(ord.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })} · {ord.timing}
                      </small>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleOrderExpand(ord.id)}
                      className="p-1.5 rounded-xl bg-[var(--surface-2)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                      title="Toggle details"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* 14-Step Canonical Order Lifecycle Status Badge */}
                  {(() => {
                    const canonical = (ord.canonical_status || ord.status) as CanonicalOrderStatus;
                    const statusMeta = ORDER_LIFECYCLE_STATUS_LABELS[canonical] || ORDER_LIFECYCLE_STATUS_LABELS.order_placed;

                    return (
                      <div className="flex flex-col gap-1.5 bg-[var(--surface-2)] p-3 rounded-2xl">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase text-[var(--ink-soft)] tracking-wider">
                            {lang === 'es' ? 'Estado del Ciclo de Vida' : 'Order Lifecycle Progress'}
                          </span>
                          <span className="text-[10.5px] font-extrabold text-[var(--palm)]">
                            Stage {statusMeta.step} of 14
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[11.5px] font-extrabold px-2.5 py-1 rounded-xl border flex items-center gap-1.5 ${statusMeta.color}`}>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {lang === 'es' ? statusMeta.es : statusMeta.en}
                          </span>
                          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg ${
                            ord.payment_status === 'confirmed'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}>
                            {ord.payment_status === 'confirmed' ? '✓ Paid' : '⏳ Payment Pending'}
                          </span>
                        </div>

                        {/* Progress Bar (1 to 14) */}
                        <div className="w-full bg-[var(--line)] h-1.5 rounded-full overflow-hidden mt-1">
                          <div
                            className="bg-[var(--palm)] h-full transition-all duration-300 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(7, (statusMeta.step / 14) * 100))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Destination & Recipient Summary */}
                  <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                    <div className="bg-[var(--surface-2)] p-2.5 rounded-xl flex flex-col gap-0.5">
                      <span className="text-[10.5px] font-extrabold uppercase text-[var(--ink-soft)] flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[var(--palm)]" />
                        {lang === 'es' ? 'Destino' : 'Destination'}
                      </span>
                      <b className="text-[var(--ink)] truncate">{ord.zone_name}</b>
                      <small className="text-[11px] text-[var(--ink-soft)] truncate">{ord.address}</small>
                    </div>

                    <div className="bg-[var(--surface-2)] p-2.5 rounded-xl flex flex-col gap-0.5">
                      <span className="text-[10.5px] font-extrabold uppercase text-[var(--ink-soft)] flex items-center gap-1">
                        <User className="w-3 h-3 text-[var(--palm)]" />
                        {lang === 'es' ? 'Cliente' : 'Customer'}
                      </span>
                      <b className="text-[var(--ink)] truncate">{ord.customer_name}</b>
                      <small className="text-[11px] text-[var(--ink-soft)] font-mono truncate">{ord.phone}</small>
                    </div>
                  </div>

                  {/* Expandable Itemized Breakdown & Customer Communication */}
                  {isExpanded && (
                    <div className="flex flex-col gap-2.5 pt-2 border-t border-[var(--line)]">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                          {lang === 'es' ? 'Plantas y Materiales Solicitados' : 'Ordered Plant Specimens'} ({ord.items.length})
                        </span>
                        {ord.assigned_supplier_name && (
                          <span className="text-[10.5px] text-[var(--palm)] font-bold truncate max-w-[200px]">
                            🌱 {ord.assigned_supplier_name}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {ord.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-[12.5px] bg-[var(--surface-2)] p-2 rounded-xl gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {it.image_url ? (
                                <img
                                  src={it.image_url}
                                  alt={it.name}
                                  className="w-9 h-9 rounded-lg object-cover shrink-0"
                                />
                              ) : (
                                <span className="w-9 h-9 rounded-lg bg-[var(--surface)] text-[12px] font-bold flex items-center justify-center shrink-0">
                                  {it.qty}×
                                </span>
                              )}
                              <div className="flex flex-col min-w-0">
                                <b className="text-[var(--ink)] truncate">
                                  {it.qty}× {it.name}
                                </b>
                                {it.size && <small className="text-[10.5px] text-[var(--ink-soft)]">{it.size}</small>}
                              </div>
                            </div>
                            <span className="font-extrabold text-[var(--ink)] shrink-0">
                              {formatMoney(it.price * it.qty, it.currency)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-[12.5px] pt-1 text-[var(--ink-soft)]">
                        <span>{lang === 'es' ? 'Tarifa de Envío' : 'Delivery Transport Fee'}:</span>
                        <span>{formatMoney(ord.delivery_fee, ord.currency)}</span>
                      </div>

                      {/* Status Transition History Trail */}
                      {ord.status_history && ord.status_history.length > 0 && (
                        <div className="bg-[var(--surface-2)] p-2.5 rounded-xl flex flex-col gap-1 text-[11px]">
                          <span className="font-bold text-[var(--ink)] uppercase text-[10px]">
                            {lang === 'es' ? 'Historial de Actualizaciones' : 'Status Event Log'}
                          </span>
                          {ord.status_history.slice(-3).map((h) => (
                            <div key={h.id} className="text-[var(--ink-soft)]">
                              • <b className="text-[var(--ink)]">{h.new_status.replace('_', ' ')}</b> — {h.notes || 'Stage updated'} ({new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                            </div>
                          ))}
                        </div>
                      )}

                      {/* In-Order Direct Messaging with Verde Roatán */}
                      <div className="bg-[var(--surface-2)] p-2.5 rounded-xl flex flex-col gap-2">
                        <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)] flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-[var(--palm)]" />
                          {lang === 'es' ? 'Mensajes sobre este pedido' : 'In-Order Messages with Dispatch'}
                        </span>

                        {ord.messages && ord.messages.length > 0 ? (
                          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto no-scrollbar">
                            {ord.messages.map((m) => (
                              <div
                                key={m.id}
                                className={`p-2 rounded-lg text-[11.5px] max-w-[88%] ${
                                  m.sender_role === 'customer'
                                    ? 'bg-[var(--palm)] text-white self-end text-right'
                                    : 'bg-[var(--surface)] text-[var(--ink)] self-start border border-[var(--line)]'
                                }`}
                              >
                                <b className="block text-[9.5px] opacity-80">{m.sender_name}</b>
                                <span>{m.message}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--ink-soft)] italic">
                            {lang === 'es'
                              ? '¿Alguna instrucción especial? Escribe a nuestro equipo de despacho.'
                              : 'Special staging notes? Chat directly with our delivery team.'}
                          </p>
                        )}

                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const txt = (e.currentTarget.elements.namedItem('msg') as HTMLInputElement)?.value;
                            if (txt && onSendCustomerMessage) {
                              onSendCustomerMessage(ord.order_id, txt);
                              (e.currentTarget.elements.namedItem('msg') as HTMLInputElement).value = '';
                            }
                          }}
                          className="flex gap-1.5 mt-1"
                        >
                          <input
                            name="msg"
                            type="text"
                            placeholder={lang === 'es' ? 'Mensaje a despacho…' : 'Message delivery dispatch…'}
                            className="flex-1 bg-[var(--surface)] border border-[var(--line)] rounded-lg px-2.5 py-1 text-[11.5px] focus:outline-none focus:border-[var(--palm)]"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1 rounded-lg bg-[var(--palm)] text-white text-[11.5px] font-bold"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* Total & Confirmation Action */}
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
                    <div className="flex flex-col">
                      <small className="text-[10.5px] font-bold text-[var(--ink-soft)] uppercase">
                        {lang === 'es' ? 'Total Pedido' : 'Order Total'}
                      </small>
                      <b className="text-[17px] font-extrabold text-[var(--palm)]">
                        {formatMoney(ord.total, ord.currency)}
                      </b>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Provider Sync Step Advance (Available for Admin or Staff simulation) */}
                      {isAdmin && onAdvanceOrderStatus && ord.status !== 'delivered' && (
                        <button
                          type="button"
                          onClick={() => onAdvanceOrderStatus(ord.id)}
                          className="py-2 px-2.5 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] font-bold text-[11.5px] hover:bg-[var(--palm)] hover:text-white transition-all border border-[var(--line)]"
                          title="Advance order stage (Provider sync)"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Customer Delivery Confirmation Button */}
                      <button
                        type="button"
                        onClick={() => onConfirmDelivery(ord.id)}
                        className="py-2.5 px-4 rounded-xl bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[13px] flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {t('confirmArrival')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. ORDER HISTORY TAB (ARCHIVED DELIVERIES WITH DETAILS)       */}
      {/* ───────────────────────────────────────────────────────────── */}
      {subTab === 'history' && (
        <div className="flex flex-col gap-3">
          {orderHistory.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-8 text-center text-[var(--ink-soft)] flex flex-col items-center gap-2.5 shadow-xs">
              <span className="w-14 h-14 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-soft)]">
                <Archive className="w-7 h-7 opacity-50" />
              </span>
              <b className="text-[15px] font-bold text-[var(--ink)]">
                {lang === 'es' ? 'No hay historial de pedidos completados' : 'No Completed Orders in History'}
              </b>
              <p className="text-[12.5px] text-[var(--ink-soft)] max-w-[280px]">
                {lang === 'es'
                  ? 'Una vez confirmada la llegada de tus plantas, se archivarán aquí como comprobante permanente.'
                  : 'Once your plant delivery is confirmed, completed orders are permanently archived here for reference.'}
              </p>
            </div>
          ) : (
            orderHistory.map((ord) => {
              const isExpanded = Boolean(expandedOrderIds[ord.id]);

              return (
                <div
                  key={ord.id}
                  className="flex flex-col gap-3 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 shadow-xs"
                >
                  <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <b className="font-mono text-[14px] text-[var(--ink)] font-bold">
                          {ord.order_id}
                        </b>
                        <span className="text-[10.5px] font-extrabold px-2 py-0.5 rounded-full bg-[var(--palm)]/15 text-[var(--palm)] flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('orderDelivered')}
                        </span>
                      </div>
                      <small className="text-[11px] text-[var(--ink-soft)] block mt-0.5">
                        {lang === 'es' ? 'Entregado:' : 'Completed:'}{' '}
                        {new Date(ord.delivered_at || ord.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </small>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleOrderExpand(ord.id)}
                      className="p-1 rounded-lg bg-[var(--surface-2)] text-[var(--ink-soft)]"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[12px] text-[var(--ink-soft)]">
                    <span className="truncate">
                      📍 {ord.zone_name} · {ord.items.length} {lang === 'es' ? 'especies' : 'items'}
                    </span>
                    <b className="font-extrabold text-[14px] text-[var(--palm)] shrink-0">
                      {formatMoney(ord.total, ord.currency)}
                    </b>
                  </div>

                  {isExpanded && (
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--line)]">
                      <small className="text-[10px] font-bold uppercase text-[var(--ink-soft)]">
                        {lang === 'es' ? 'Detalle de la Entrega' : 'Delivery Items'}
                      </small>
                      {ord.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[12px] py-0.5">
                          <span>
                            {it.qty}× {it.name} {it.size ? `(${it.size})` : ''}
                          </span>
                          <span className="font-bold">{formatMoney(it.price * it.qty, it.currency)}</span>
                        </div>
                      ))}
                      <div className="text-[11px] text-[var(--ink-soft)] italic mt-1">
                        {lang === 'es' ? 'Dirección:' : 'Property:'} {ord.address}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. NEW DELIVERY REQUEST / CART VIEW                           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {subTab === 'cart' && (
        <>
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-3.5 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-8 my-auto shadow-xs">
              <span className="w-16 h-16 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)] flex items-center justify-center">
                <ShoppingBag className="w-8 h-8 opacity-60" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-[18px] font-extrabold text-[var(--ink)]">
                  {t('emptyCart')}
                </h2>
                <p className="text-[13px] text-[var(--ink-soft)] max-w-[280px]">
                  {lang === 'es'
                    ? 'Agrega palmeras, plantas ornamentales o abonos orgánicos a tu solicitud de entrega.'
                    : 'Add plants, palms, or organic garden supplies to your island delivery request.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('shop')}
                className="bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-bold text-[14px] px-5 py-2.5 rounded-xl shadow-xs active:scale-98 transition-all mt-1"
              >
                {t('browseShop')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Cart Items List */}
              <div className="flex flex-col gap-2.5">
                {cart.map((cartItem) => {
                  const item = getItem(cartItem.id);
                  const itemPriceInCur = convertVal(item.price, item.currency, currency);

                  return (
                    <div
                      key={cartItem.id}
                      className="flex items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-[var(--surface-2)] overflow-hidden shrink-0 flex items-center justify-center">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Palmtree className="w-6 h-6 text-[var(--palm)]" />
                          )}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <b className="text-[14px] text-[var(--ink)] font-bold truncate">
                            {item.name}
                          </b>
                          <small className="text-[11.5px] text-[var(--ink-soft)] truncate">
                            {item.size} · {formatMoney(itemPriceInCur, currency)}
                          </small>
                          <span className="text-[13px] font-extrabold text-[var(--palm)] mt-0.5">
                            {formatMoney(itemPriceInCur * cartItem.qty, currency)}
                          </span>
                        </div>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center gap-1.5 shrink-0 bg-[var(--surface-2)] p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(cartItem.id, -1)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--ink)] font-bold hover:bg-[var(--line)]"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center text-[13px] font-extrabold tabular-nums">
                          {cartItem.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty(cartItem.id, 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--ink)] font-bold hover:bg-[var(--line)]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(cartItem.id)}
                          className="p-1.5 text-red-500 hover:text-red-700 ml-1"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Delivery Zone Selector */}
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-4 flex flex-col gap-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-extrabold text-[var(--ink-soft)] uppercase tracking-wider">
                    {t('deliveryArea')}
                  </span>
                  <div className="flex items-center gap-2">
                    {isAdmin && onOpenTransportFeeModal && (
                      <button
                        type="button"
                        onClick={() => onOpenTransportFeeModal(currentZone?.id)}
                        className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-[var(--palm)]/15 text-[var(--palm)] hover:bg-[var(--palm)] hover:text-white transition-all flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        {lang === 'es' ? 'Editar Tarifa' : 'Edit Transport Fee'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenZonePicker}
                      className="text-[12px] font-bold text-[var(--palm)] hover:underline flex items-center gap-0.5"
                    >
                      Change Zone <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <b className="text-[15px] text-[var(--ink)]">{currentZone?.name}</b>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-[var(--ink-soft)]">
                      {formatMoney(deliveryFee, currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Currency Toggle */}
              <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 shadow-xs">
                <span className="text-[12.5px] font-bold text-[var(--ink)] flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-[var(--palm)]" />
                  {t('paymentCurrency')}
                </span>
                <div className="flex bg-[var(--surface-2)] p-0.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => onCurrencyChange('HNL')}
                    className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all ${
                      currency === 'HNL' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)]'
                    }`}
                  >
                    HNL (L)
                  </button>
                  <button
                    type="button"
                    onClick={() => onCurrencyChange('USD')}
                    className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all ${
                      currency === 'USD' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)]'
                    }`}
                  >
                    USD ($)
                  </button>
                </div>
              </div>

              {/* Recipient Details */}
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4.5 flex flex-col gap-3 shadow-xs">
                <h3 className="text-[15px] font-extrabold text-[var(--ink)]">
                  {lang === 'es' ? 'Datos de Entrega en la Isla' : 'Island Delivery Details'}
                </h3>

                {errorMsg && (
                  <div className="text-[12px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-2.5 rounded-xl">
                    {errorMsg}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-bold text-[var(--ink)]">{t('fullName')} *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Maya Wood"
                    className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--palm)]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-bold text-[var(--ink)]">{t('whatsappPhone')} *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+504 9900-0000"
                    className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--palm)]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-bold text-[var(--ink)]">{t('deliveryAddress')} *</label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. West Bay Road, Villa Pelican #3"
                    className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--palm)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[12px] font-bold text-[var(--ink)]">{t('preferredTiming')}</label>
                    <select
                      value={timing}
                      onChange={(e) => setTiming(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-2 text-[12.5px] font-bold"
                    >
                      <option value="Today / Urgent">Today / Urgent</option>
                      <option value="Tomorrow">Tomorrow</option>
                      <option value="This week">This week</option>
                      <option value="Weekend morning">Weekend morning</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[12px] font-bold text-[var(--ink)]">{t('orderNotes')}</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Gate code, dock dropoff..."
                      className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[12.5px]"
                    />
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="pt-2 border-t border-[var(--line)] flex flex-col gap-1.5 text-[13px]">
                  <div className="flex justify-between text-[var(--ink-soft)]">
                    <span>{t('estimatedItems')}</span>
                    <span>{formatMoney(subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between text-[var(--ink-soft)]">
                    <span>{t('deliveryFee')} ({currentZone?.name})</span>
                    <span>{formatMoney(deliveryFee, currency)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[15px] font-extrabold text-[var(--ink)] pt-1 border-t border-[var(--line)]">
                    <span>{t('estimatedTotal')}</span>
                    <b className="text-[18px] text-[var(--palm)]">{formatMoney(total, currency)}</b>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[48px] bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[14.5px] rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all mt-2 disabled:opacity-50"
                >
                  <Truck className="w-4.5 h-4.5" />
                  {isSubmitting ? t('submitting') : t('submitOrder')}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
};
