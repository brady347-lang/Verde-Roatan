import { ServiceRequestStatus } from '../types';

export const SERVICE_STATUS_ORDER: ServiceRequestStatus[] = [
  'new_request',
  'pending_review',
  'quote_preparation',
  'quote_sent',
  'awaiting_response',
  'accepted',
  'in_progress',
  'completed',
  'cancelled'
];

export const SERVICE_STATUS_LABELS: Record<ServiceRequestStatus, { en: string; es: string }> = {
  new_request: { en: 'New request', es: 'Nueva solicitud' },
  pending_review: { en: 'Pending review', es: 'Pendiente de revisión' },
  quote_preparation: { en: 'Quote preparation', es: 'Preparando cotización' },
  quote_sent: { en: 'Quote sent', es: 'Cotización enviada' },
  awaiting_response: { en: 'Awaiting response', es: 'Esperando respuesta' },
  accepted: { en: 'Accepted', es: 'Aceptada' },
  in_progress: { en: 'In progress', es: 'En progreso' },
  completed: { en: 'Completed', es: 'Completada' },
  cancelled: { en: 'Cancelled', es: 'Cancelada' }
};

export const SERVICE_STATUS_STYLES: Record<ServiceRequestStatus, string> = {
  new_request: 'bg-amber-500/15 text-amber-700',
  pending_review: 'bg-sky-500/15 text-sky-700',
  quote_preparation: 'bg-indigo-500/15 text-indigo-700',
  quote_sent: 'bg-violet-500/15 text-violet-700',
  awaiting_response: 'bg-orange-500/15 text-orange-700',
  accepted: 'bg-emerald-500/15 text-emerald-700',
  in_progress: 'bg-teal-500/15 text-teal-700',
  completed: 'bg-[var(--palm)]/15 text-[var(--palm)]',
  cancelled: 'bg-red-500/15 text-red-700'
};

export function serviceStatusLabel(status: ServiceRequestStatus, lang: 'en' | 'es'): string {
  return SERVICE_STATUS_LABELS[status]?.[lang] || status;
}

/** Digits only, suitable for a wa.me link. Honduras country code is added to 8-digit local numbers. */
export function whatsappNumber(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 8) return `504${digits}`;
  return digits;
}
