import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { fetchIdentificationReviewQueue, reviewIdentificationRecord } from '../services/api';
import { IdentificationReviewRecord, IdentificationVerificationLevel, Language } from '../types';

type Tab = 'pending' | 'approved' | 'rejected';
const LEVEL_LABEL: Record<IdentificationVerificationLevel, string> = {
  ai_identified: 'AI IDENTIFIED',
  user_confirmed: 'USER CONFIRMED',
  scientifically_verified: 'SCIENTIFICALLY VERIFIED'
};
const LEVEL_STYLE: Record<IdentificationVerificationLevel, string> = {
  ai_identified: 'bg-[var(--surface-2)] text-[var(--ink-soft)]',
  user_confirmed: 'bg-sky-500/15 text-sky-700',
  scientifically_verified: 'bg-[var(--palm)]/15 text-[var(--palm)]'
};
const DECISION_LABEL: Record<string, string> = {
  confirmed: 'Yes, that\'s correct',
  almost: 'Almost, something is wrong',
  not_my_plant: 'Not my plant'
};

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
  const [tab, setTab] = useState<Tab>('pending');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [basis, setBasis] = useState('');

  const isSpanish = lang === 'es';

  const loadReviews = useCallback(async () => {
    if (!accessToken) {
      setError(isSpanish ? 'Inicia sesión como administrador.' : 'Administrator sign-in is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await fetchIdentificationReviewQueue(accessToken, tab);
      setReviews(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load identification reviews.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isSpanish, tab]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const handleReview = async (reviewId: string, status: 'approved' | 'rejected', verificationBasis = '') => {
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
          : 'Rejected by Verde Roatan administrator after review.',
        verificationBasis
      );
      setVerifyingId(null);
      setBasis('');
      if (verificationBasis) {
        setReviews((previous) => previous.map((item) => item.id === reviewId
          ? { ...item, verification_level: 'scientifically_verified', verification_basis: verificationBasis }
          : item));
      } else {
        setReviews((previous) => previous.filter((item) => item.id !== reviewId));
      }
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

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        {(['pending', 'approved', 'rejected'] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setTab(value); setVerifyingId(null); }}
            className={`min-h-[36px] rounded-lg text-[12px] font-extrabold ${tab === value ? 'bg-[var(--surface)] text-[var(--palm)] shadow-xs' : 'text-[var(--ink-soft)]'}`}
          >
            {value === 'pending' ? (isSpanish ? 'Pendientes' : 'Pending') : value === 'approved' ? (isSpanish ? 'Aprobadas' : 'Approved') : (isSpanish ? 'Rechazadas' : 'Rejected')}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-[var(--ink)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && reviews.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-5 text-center text-[13px] text-[var(--ink-soft)]">
          {isSpanish ? 'No hay identificaciones en esta lista.' : 'No identification reviews in this list.'}
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
              <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${LEVEL_STYLE[review.verification_level || 'ai_identified']}`}>
                {LEVEL_LABEL[review.verification_level || 'ai_identified']}
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

            <div className="rounded-xl bg-[var(--surface-2)] p-3 text-[12px] text-[var(--ink)]">
              {review.user_decision && (
                <p><span className="font-bold">{isSpanish ? 'Respuesta del usuario: ' : 'User answer: '}</span>{DECISION_LABEL[review.user_decision]}</p>
              )}
              {(review.ai_family || review.ai_genus || review.ai_species) && (
                <p><span className="font-bold">{isSpanish ? 'Taxonomía IA: ' : 'AI taxonomy: '}</span>{[review.ai_family, review.ai_genus, review.ai_species].filter(Boolean).join(' › ')}</p>
              )}
              {review.submitter_notes && <p><span className="font-bold">{isSpanish ? 'Notas: ' : 'Notes: '}</span>{review.submitter_notes}</p>}
              {(review.source_platform || review.ai_model) && (
                <p className="text-[var(--ink-soft)]">{[review.source_app, review.source_platform, review.source_language, review.ai_model].filter(Boolean).join(' · ')}</p>
              )}
              {review.verification_level === 'scientifically_verified' && (
                <p className="mt-1"><span className="font-bold">{isSpanish ? 'Base científica: ' : 'Scientific basis: '}</span>{review.verification_basis}</p>
              )}
            </div>

            <p className="text-[10px] text-[var(--ink-soft)]">
              {new Date(review.created_at).toLocaleString(isSpanish ? 'es-HN' : 'en-US')}
              {typeof review.ai_confidence === 'number'
                ? ` · ${Math.round(review.ai_confidence * 100)}% ${isSpanish ? 'confianza IA' : 'AI confidence'}`
                : ''}
            </p>

            {tab === 'pending' && (
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
            )}
            {tab === 'approved' && review.verification_level !== 'scientifically_verified' && (
              verifyingId === review.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={basis}
                    onChange={(event) => setBasis(event.target.value)}
                    rows={2}
                    placeholder={isSpanish ? 'Base científica (referencia, herbario, experto) — mínimo 10 caracteres' : 'Scientific basis (reference, herbarium, expert) — min 10 characters'}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--palm)]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={workingId === review.id || basis.trim().length < 10} onClick={() => void handleReview(review.id, 'approved', basis.trim())} className="min-h-[42px] rounded-xl bg-[var(--palm)] px-2 text-[12px] font-extrabold text-white disabled:opacity-50">
                      {isSpanish ? 'Verificar científicamente' : 'Mark scientifically verified'}
                    </button>
                    <button type="button" onClick={() => { setVerifyingId(null); setBasis(''); }} className="min-h-[42px] rounded-xl border border-[var(--line)] px-2 text-[12px] font-extrabold text-[var(--ink)]">
                      {isSpanish ? 'Cancelar' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setVerifyingId(review.id); setBasis(''); }} className="min-h-[42px] rounded-xl border border-[var(--palm)] px-3 text-[12px] font-extrabold text-[var(--palm)]">
                  {isSpanish ? 'Verificación científica…' : 'Scientific verification…'}
                </button>
              )
            )}
          </div>
        </article>
      ))}
    </section>
  );
};
