import React, { useState } from 'react';
import { ExternalLink, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { LEGAL_WORKER_URL } from '../data/initialData';
import { supabaseRpcRequest } from '../services/api';
import { Language } from '../types';

interface Props {
  lang: Language;
  accessToken?: string;
  isAdmin: boolean;
  onDeleted: () => void;
}

// Google Play requires an in-app way to delete the account and its data, plus a privacy policy link.
export const AccountPrivacySection: React.FC<Props> = ({ lang, accessToken, isAdmin, onDeleted }) => {
  const es = lang === 'es';
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const word = es ? 'ELIMINAR' : 'DELETE';

  const remove = async () => {
    if (!accessToken || typed.trim().toUpperCase() !== word) return;
    setBusy(true); setError('');
    try {
      await supabaseRpcRequest('delete_my_account', {}, accessToken);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : (es ? 'No se pudo eliminar la cuenta.' : 'The account could not be deleted.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4">
      <b className="text-[14px] text-[var(--ink)] flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-[var(--palm)]" />{es ? 'Privacidad y datos' : 'Privacy & data'}</b>
      <a href={`${LEGAL_WORKER_URL}/privacy`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-[var(--palm)] flex items-center gap-1">
        {es ? 'Política de privacidad' : 'Privacy policy'} <ExternalLink className="w-3.5 h-3.5" />
      </a>
      {!isAdmin && (!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-left text-[13px] font-bold text-red-600 flex items-center gap-1.5 min-h-[40px]">
          <Trash2 className="w-4 h-4" />{es ? 'Eliminar mi cuenta' : 'Delete my account'}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-3">
          <p className="text-[12.5px] text-red-900 leading-relaxed">
            {es
              ? 'Se eliminarán tu cuenta, tus solicitudes de servicio y tus identificaciones de plantas. Los pedidos se conservan como registros sin tu nombre, teléfono ni dirección. Esto no se puede deshacer.'
              : 'This permanently deletes your account, your service requests and your plant identifications. Orders are kept as records without your name, phone or address. This cannot be undone.'}
          </p>
          <label className="text-[12px] font-bold text-red-900">
            {es ? `Escribe ${word} para confirmar` : `Type ${word} to confirm`}
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" className="mt-1 w-full rounded-xl border border-red-300 bg-[var(--surface)] text-[var(--ink)] px-3 py-2 text-[14px]" />
          </label>
          {error && <p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setOpen(false); setTyped(''); setError(''); }} disabled={busy} className="flex-1 min-h-[42px] rounded-xl bg-[var(--surface)] border border-[var(--line)] text-[13px] font-bold text-[var(--ink)]">{es ? 'Cancelar' : 'Cancel'}</button>
            <button type="button" onClick={() => void remove()} disabled={busy || typed.trim().toUpperCase() !== word} className="flex-1 min-h-[42px] rounded-xl bg-red-600 text-white text-[13px] font-extrabold disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 inline animate-spin" /> : (es ? 'Eliminar para siempre' : 'Delete forever')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
