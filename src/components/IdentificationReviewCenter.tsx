import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { fetchIdentificationReviewQueue, reviewIdentificationRecord } from '../services/api';
import { IdentificationReviewRecord, Language } from '../types';

interface IdentificationReviewCenterProps {
  lang: Language;
  accessToken?: string;
}

export const IdentificationReviewCenter: React.FC<IdentificationReviewCenterProps> = ({
  lang,
  accessToken
}) => {
  const [reviews, setReviews] = useState<IdentificationReviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isSpanish = lang === 'es';

  const loadReviews = useCallback(async () => {
    if (!accessToken) {
      setError(isSpanish ? 'Inicia sesión como administrador.' : 'Administrator sign-in is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await fetchIdentificationReviewQueue(accessToken, 'pending');
      setReviews(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load identification reviews.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isSpanish]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const handleReview = async (reviewId: string, status: 'approved' | 'rejected') => {
    if (!accessToken) return;
    setWorkingId(reviewId);
    setError('');
    try {
      await reviewIdentificationRecord(
        accessToken,
        reviewId,
        status,
        status === 'approved'
          ? 'Approved by Verde Roatan administrator after review.'
          : 'Rejected by Verde Roatan administrator after review.'
      );
      setReviews((previous) => previous.filter((item) => item.id !== reviewId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The review could not be updated.');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[16px] font-extrabold text-[var(--ink)]">
            {isSpanish ? 'Revisión de identificaciones' : 'Identification Review Queue'}
          </h3>
          <p className="text-[12px] text-[var(--ink-soft)]">
            {isSpanish
              ? 'Revisa las confirmaciones y correcciones enviadas por los usuarios.'
              : 'Review customer confirmations and suggested corrections before approval.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadReviews()}
          disabled={loading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--palm)] disabled:opacity-50"
          aria-label={isSpanish ? 'Actualizar' : 'Refresh'}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-[var(--ink)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && reviews.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-5 text-center text-[13px] text-[var(--ink-soft)]">
          {isSpanish ? 'No hay identificaciones pendientes.' : 'No pending identification reviews.'}
        </div>
      )}

      {reviews.map((review) => (
        <article key={review.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          {review.image_url && (
            <img
              src={review.image_url}
              alt={isSpanish ? 'Foto de la planta enviada para revisión' : 'Plant submitted for identification review'}
              className="h-44 w-full bg-[var(--surface-2)] object-cover"
              loading="lazy"
            />
          )}
          <div className="flex flex-col gap-2 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]">
                  {isSpanish ? 'Identificación de IA' : 'AI identification'}
                </p>
                <h4 className="text-[14px] font-extrabold text-[var(--ink)]">
                  {review.ai_common_name || 'Unknown specimen'}
                </h4>
                {review.ai_scientific_name && (
                  <p className="text-[12px] italic text-[var(--ink-soft)]">{review.ai_scientific_name}</p>
                )}
              </div>
              <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700">
                {isSpanish ? 'Pendiente' : 'Pending'}
              </span>
            </div>

            {(review.proposed_common_name || review.proposed_scientific_name) && (
              <div className="rounded-xl bg-[var(--surface-2)] p-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--ink-soft)]">
                  {isSpanish ? 'Corrección del usuario' : 'Customer correction'}
                </p>
                {review.proposed_common_name && (
                  <p className="text-[13px] font-bold text-[var(--ink)]">{review.proposed_common_name}</p>
                )}
                {review.proposed_scientific_name && (
                  <p className="text-[12px] italic text-[var(--ink-soft)]">{review.proposed_scientific_name}</p>
                )}
              </div>
            )}

            <p className="text-[10px] text-[var(--ink-soft)]">
              {new Date(review.created_at).toLocaleString(isSpanish ? 'es-HN' : 'en-US')}
              {typeof review.ai_confidence === 'number'
                ? ` · ${Math.round(review.ai_confidence * 100)}% ${isSpanish ? 'confianza IA' : 'AI confidence'}`
                : ''}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={workingId === review.id}
                onClick={() => void handleReview(review.id, 'approved')}
                className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[var(--palm)] px-2 text-[12px] font-extrabold text-white disabled:opacity-50"
              >
                {workingId === review.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isSpanish ? 'Aprobar' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={workingId === review.id}
                onClick={() => void handleReview(review.id, 'rejected')}
                className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-red-500/40 px-2 text-[12px] font-extrabold text-red-600 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                {isSpanish ? 'Rechazar' : 'Reject'}
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
};
