import React, { useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Info,
  Layers,
  MessageSquare,
  PackageCheck,
  Palmtree,
  Plus,
  RefreshCw,
  Send,
  Truck,
  X
} from 'lucide-react';
import {
  ActiveOrder,
  CanonicalOrderStatus,
  Language,
  OrderMessage,
  RegisteredSupplier,
  SupplierPurchaseRequest
} from '../types';
import { ORDER_LIFECYCLE_STATUS_LABELS } from '../services/orderSystem';

interface SupplierPortalProps {
  lang: Language;
  suppliers: RegisteredSupplier[];
  currentSupplierId: string;
  onSelectSupplierId: (id: string) => void;
  purchaseRequests: SupplierPurchaseRequest[];
  onUpdateRequest: (req: SupplierPurchaseRequest) => void;
  orders: ActiveOrder[];
  onSendMessage: (orderId: string, message: string, supplierId: string, supplierName: string) => void;
  formatMoney: (val: number, cur: string) => React.ReactNode;
}

export const SupplierPortal: React.FC<SupplierPortalProps> = ({
  lang,
  suppliers,
  currentSupplierId,
  onSelectSupplierId,
  purchaseRequests,
  onUpdateRequest,
  orders,
  onSendMessage,
  formatMoney
}) => {
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [prepHoursInput, setPrepHoursInput] = useState<number>(4);
  const [supplierNoteInput, setSupplierNoteInput] = useState<string>('');
  const [newMsgText, setNewMsgText] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'ready' | 'fulfilled'>('all');

  const activeSupplier = suppliers.find((s) => s.id === currentSupplierId) || suppliers[0];

  // Supplier sees ONLY orders assigned to them
  const myRequests = purchaseRequests.filter((req) => {
    const matchSup = !currentSupplierId || req.supplier_id === currentSupplierId;
    if (!matchSup) return false;
    if (filterStatus === 'pending') return req.status === 'pending_confirmation';
    if (filterStatus === 'ready') return req.status === 'ready_for_pickup';
    if (filterStatus === 'fulfilled') return req.status === 'fulfilled';
    return true;
  });

  const selectedRequest = purchaseRequests.find((r) => r.id === selectedReqId) || myRequests[0];
  const relatedOrder = orders.find((o) => o.order_id === selectedRequest?.order_id);

  // Status progression actions
  const handleConfirmAvailability = (req: SupplierPurchaseRequest) => {
    const updated: SupplierPurchaseRequest = {
      ...req,
      status: 'confirmed',
      estimated_prep_hours: Number(prepHoursInput) || 4,
      supplier_notes: supplierNoteInput.trim() || 'Availability confirmed by nursery staff.',
      items: req.items.map((it) => ({ ...it, status: 'confirmed' }))
    };
    onUpdateRequest(updated);
  };

  const handleMarkReadyForPickup = (req: SupplierPurchaseRequest) => {
    const updated: SupplierPurchaseRequest = {
      ...req,
      status: 'ready_for_pickup',
      supplier_notes: (req.supplier_notes ? req.supplier_notes + ' | ' : '') + 'Specimens rootballed and staged for flatbed pickup.'
    };
    onUpdateRequest(updated);
  };

  const handleSendSupplierMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgText.trim() || !selectedRequest) return;
    onSendMessage(selectedRequest.order_id, newMsgText.trim(), activeSupplier.id, activeSupplier.name);
    setNewMsgText('');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Supplier Identity Banner */}
      <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-3xl p-4 flex flex-col gap-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-[var(--palm)]/15 text-[var(--palm)] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-[16px] font-extrabold text-[var(--ink)]">
                {lang === 'es' ? 'Portal de Proveedor & Vivero' : 'Supplier Interaction Portal'}
              </h2>
              <p className="text-[11.5px] text-[var(--ink-soft)]">
                {lang === 'es'
                  ? 'Gestión de órdenes de compra, stock y confirmación de preparación'
                  : 'Purchase requests, inventory reservation, and preparation fulfillment'}
              </p>
            </div>
          </div>

          {/* Supplier Picker Toggle */}
          <select
            value={currentSupplierId}
            onChange={(e) => onSelectSupplierId(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-[var(--ink)]"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.location})
              </option>
            ))}
          </select>
        </div>

        {/* Confidentiality Notice */}
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11.5px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            {lang === 'es'
              ? 'Privacidad: Datos personales de clientes se encuentran protegidos. Solo se muestran las especies y ubicación de entrega.'
              : 'Privacy Protected: Customer contact details are restricted. Only requested botanical specimens and delivery neighborhood are visible.'}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'all', label: lang === 'es' ? 'Todas' : 'All Requests' },
          { id: 'pending', label: lang === 'es' ? 'Pendientes' : 'Pending Confirmation' },
          { id: 'ready', label: lang === 'es' ? 'Listas para Retiro' : 'Ready for Pickup' },
          { id: 'fulfilled', label: lang === 'es' ? 'Despachadas' : 'Fulfilled' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterStatus(tab.id as any)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
              filterStatus === tab.id
                ? 'bg-[var(--palm)] text-white shadow-xs'
                : 'bg-[var(--surface-2)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {myRequests.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-8 text-center text-[var(--ink-soft)] flex flex-col items-center gap-2">
          <PackageCheck className="w-8 h-8 opacity-40 text-[var(--palm)]" />
          <b className="text-[14.5px] text-[var(--ink)]">
            {lang === 'es' ? 'No hay solicitudes de compra pendientes' : 'No Purchase Requests Found'}
          </b>
          <p className="text-[12px] max-w-[260px]">
            {lang === 'es'
              ? 'Cuando Verde Roatán requiera plantas de tu vivero, aparecerán aquí para tu confirmación.'
              : 'When orders require specimens from your nursery beds, they will appear here.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {myRequests.map((req) => {
            const isSelected = selectedRequest?.id === req.id;
            return (
              <div
                key={req.id}
                onClick={() => setSelectedReqId(req.id)}
                className={`bg-[var(--surface)] border rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all cursor-pointer ${
                  isSelected ? 'border-[var(--palm)] shadow-sm' : 'border-[var(--line)] hover:border-[var(--palm)]/50'
                }`}
              >
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-extrabold text-[var(--ink)]">
                      Order #{req.order_id}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)] uppercase">
                      {req.status.replace('_', ' ')}
                    </span>
                  </div>
                  <b className="text-[13px] font-extrabold text-[var(--palm)]">
                    {formatMoney(req.total_supplier_cost, req.currency)}
                  </b>
                </div>

                {/* Items in Request */}
                <div className="flex flex-col gap-1.5">
                  {req.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-[var(--ink)] font-medium">
                        {it.quantity}× {it.name}
                      </span>
                      <span className="text-[11.5px] text-[var(--ink-soft)] font-bold">
                        {formatMoney(it.unit_price * it.quantity, it.currency)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Quick actions for supplier */}
                <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--ink-soft)]">
                  <span>Created: {new Date(req.created_at).toLocaleDateString()}</span>
                  <span className="font-bold text-[var(--palm)]">
                    {isSelected ? '✓ Viewing details' : 'Tap to manage →'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Purchase Request Deep Interaction Panel */}
      {selectedRequest && (
        <div className="bg-[var(--surface)] border border-[var(--palm)]/40 rounded-3xl p-4 flex flex-col gap-3.5 shadow-md mt-2">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
            <div>
              <span className="text-[11px] font-bold uppercase text-[var(--palm)]">
                Fulfillment Workspace
              </span>
              <h3 className="text-[16px] font-extrabold text-[var(--ink)]">
                Purchase Order #{selectedRequest.id} (Ref: {selectedRequest.order_id})
              </h3>
            </div>
            <span className="text-[12px] font-bold px-2.5 py-1 rounded-xl bg-[var(--palm)] text-white">
              {selectedRequest.status.toUpperCase()}
            </span>
          </div>

          {/* Botanical Specimen Checklist & Alternatives */}
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-extrabold text-[var(--ink)]">
              Requested Plants & Stock Verification
            </span>
            {selectedRequest.items.map((it) => (
              <div
                key={it.id}
                className="p-2.5 rounded-xl bg-[var(--surface-2)] flex items-center justify-between gap-2"
              >
                <div>
                  <b className="text-[13px] text-[var(--ink)]">{it.quantity}× {it.name}</b>
                  <p className="text-[11px] text-[var(--ink-soft)]">
                    Wholesale: {formatMoney(it.unit_price, it.currency)} each
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Confirmed
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Supplier Prep Time & Notes Input */}
          <div className="grid grid-cols-2 gap-2 bg-[var(--surface-2)] p-2.5 rounded-2xl">
            <div className="flex flex-col gap-1">
              <label className="text-[11.5px] font-bold text-[var(--ink)] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[var(--palm)]" />
                Est. Prep Time (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="72"
                value={prepHoursInput}
                onChange={(e) => setPrepHoursInput(Number(e.target.value))}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[12px] font-bold"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11.5px] font-bold text-[var(--ink)]">
                Wholesale Total Due
              </label>
              <div className="h-full flex items-center font-extrabold text-[14px] text-[var(--palm)]">
                {formatMoney(selectedRequest.total_supplier_cost, selectedRequest.currency)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11.5px] font-bold text-[var(--ink)]">
              Supplier Notes / Bed Location
            </label>
            <input
              type="text"
              value={supplierNoteInput}
              onChange={(e) => setSupplierNoteInput(e.target.value)}
              placeholder="e.g. Bed #3 near cistern, inspected fronds"
              className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[12px]"
            />
          </div>

          {/* Supplier Status Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {selectedRequest.status === 'pending_confirmation' && (
              <button
                type="button"
                onClick={() => handleConfirmAvailability(selectedRequest)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[12.5px] flex items-center justify-center gap-1.5 shadow-xs transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm Stock & Availability
              </button>
            )}

            {selectedRequest.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => handleMarkReadyForPickup(selectedRequest)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[12.5px] flex items-center justify-center gap-1.5 shadow-xs transition-all"
              >
                <PackageCheck className="w-4 h-4" />
                Mark Ready for Flatbed Pickup
              </button>
            )}

            {selectedRequest.status === 'ready_for_pickup' && (
              <div className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-[12px] flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" />
                Staged & Awaiting Flatbed Driver
              </div>
            )}
          </div>

          {/* Supplier & Admin Communication History */}
          <div className="pt-2 border-t border-[var(--line)] flex flex-col gap-2">
            <span className="text-[11.5px] font-extrabold uppercase text-[var(--ink-soft)] flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[var(--palm)]" />
              Direct Communication with Verde Operations
            </span>

            {/* Chat Thread */}
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto no-scrollbar bg-[var(--surface-2)] p-2 rounded-xl">
              {relatedOrder?.messages && relatedOrder.messages.length > 0 ? (
                relatedOrder.messages
                  .filter((m) => m.sender_role === 'supplier' || m.recipient_role === 'supplier' || m.recipient_role === 'all')
                  .map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2 rounded-lg text-[11.5px] max-w-[85%] ${
                        msg.sender_role === 'supplier'
                          ? 'bg-[var(--palm)] text-white self-end text-right'
                          : 'bg-[var(--surface)] text-[var(--ink)] self-start border border-[var(--line)]'
                      }`}
                    >
                      <b className="block text-[10px] opacity-80">{msg.sender_name}</b>
                      <span>{msg.message}</span>
                    </div>
                  ))
              ) : (
                <small className="text-[11px] text-[var(--ink-soft)] text-center py-2">
                  No message history yet. Send a note to Verde Roatán dispatch.
                </small>
              )}
            </div>

            {/* Message input */}
            <form onSubmit={handleSendSupplierMessage} className="flex gap-1.5">
              <input
                type="text"
                value={newMsgText}
                onChange={(e) => setNewMsgText(e.target.value)}
                placeholder="Message Verde Roatán dispatch regarding this order…"
                className="flex-1 bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[var(--palm)]"
              />
              <button
                type="submit"
                disabled={!newMsgText.trim()}
                className="px-3 py-1.5 rounded-xl bg-[var(--palm)] text-white text-[12px] font-bold disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
