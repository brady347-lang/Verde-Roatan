import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clipboard, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../data/initialData';
import { supabaseRpcRequest } from '../services/api';
import { AuthSession, Language } from '../types';
import { SupplierProductWorkspace } from './SupplierProductWorkspace';

type IdentificationReport = { id: string; product_id: string; supplier_user_id: string; ai_common_name: string | null; ai_scientific_name: string | null; corrected_common_name: string | null; corrected_scientific_name: string | null; report_notes: string; image_url: string | null; status: string; created_at: string; };

type Application = {
  id: string;
  user_id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  island_location: string;
  physical_address: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'suspended';
  admin_notes?: string | null;
  created_at: string;
};

async function requestRows(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {})
    },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.details || 'Supplier service is temporarily unavailable.');
  return payload;
}

export const SupplierOnboardingPanel: React.FC<{
  lang: Language;
  session: AuthSession;
  isAdmin: boolean;
}> = ({ lang, session, isAdmin }) => {
  const spanish = lang === 'es';
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState(session.user.full_name || '');
  const [phone, setPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState(session.user.email || '');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [hours, setHours] = useState('72');
  const [issuedCode, setIssuedCode] = useState('');
  const [application, setApplication] = useState<Application | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [identificationReports, setIdentificationReports] = useState<IdentificationReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadIdentificationReports = useCallback(async () => {
    if (!isAdmin) return;
    const rows = await requestRows('supplier_identification_reports?select=*&order=created_at.desc', session.access_token);
    setIdentificationReports(Array.isArray(rows) ? rows : []);
  }, [isAdmin, session.access_token]);

  const loadApplications = useCallback(async () => {
    const rows = await requestRows(
      isAdmin
        ? 'supplier_applications?select=*&order=created_at.desc'
        : `supplier_applications?select=*&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
      session.access_token
    );
    if (isAdmin) setApplications(Array.isArray(rows) ? rows : []);
    else setApplication(Array.isArray(rows) && rows.length ? rows[0] : null);
  }, [isAdmin, session.access_token, session.user.id]);

  useEffect(() => {
    let active = true;
    loadApplications().catch((err) => { if (active) setError(err.message); });
    if (isAdmin) loadIdentificationReports().catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [loadApplications, loadIdentificationReports, isAdmin]);

  const reviewIdentificationReport = async (item: IdentificationReport, status: 'reviewed' | 'resolved' | 'dismissed') => {
    setLoading(true); setError('');
    try {
      await requestRows('supplier_identification_reports?id=eq.' + encodeURIComponent(item.id), session.access_token, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status, reviewed_by: session.user.id, reviewed_at: new Date().toISOString() }) });
      await loadIdentificationReports();
    } catch (err: any) { setError(err.message || 'Could not update identification report.'); }
    finally { setLoading(false); }
  };

  const issueCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(''); setMessage(''); setIssuedCode('');
    try {
      const result = await supabaseRpcRequest('issue_supplier_activation_code', { p_valid_hours: Number(hours) }, session.access_token);
      setIssuedCode(String(result || ''));
      setMessage(spanish ? 'Código creado. Cópialo ahora; no volverá a mostrarse.' : 'Code created. Copy it now; it will not be shown again.');
    } catch (err: any) { setError(err.message || 'Could not create activation code.'); }
    finally { setLoading(false); }
  };

  const redeemCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(''); setMessage('');
    try {
      await supabaseRpcRequest('redeem_supplier_activation_code', {
        p_code: code,
        p_business_name: businessName,
        p_contact_name: contactName,
        p_phone: phone,
        p_email: businessEmail,
        p_island_location: location,
        p_physical_address: address || null
      }, session.access_token);
      setCode('');
      setMessage(spanish ? 'Solicitud enviada. Espera la revisión del administrador antes de publicar.' : 'Application submitted. Wait for administrator review before publishing.');
      await loadApplications();
    } catch (err: any) { setError(err.message || 'Could not submit supplier application.'); }
    finally { setLoading(false); }
  };

  const reviewApplication = async (item: Application, status: 'approved' | 'rejected') => {
    setLoading(true); setError(''); setMessage('');
    try {
      await requestRows(
        `supplier_applications?id=eq.${encodeURIComponent(item.id)}`,
        session.access_token,
        { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status }) }
      );
      setMessage(status === 'approved'
        ? (spanish ? 'Proveedor aprobado; se creó su vivero privado.' : 'Supplier approved; their private nursery account was created.')
        : (spanish ? 'Solicitud rechazada.' : 'Application rejected.'));
      await loadApplications();
    } catch (err: any) { setError(err.message || 'Could not update application.'); }
    finally { setLoading(false); }
  };

  if (isAdmin) {
    return (
      <section className="flex flex-col gap-3">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-4 h-4 text-[var(--palm)]" />
            <b className="text-[13px] text-[var(--ink)]">{spanish ? 'Códigos de activación para proveedores' : 'Supplier activation codes'}</b>
          </div>
          <form onSubmit={issueCode} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--ink-soft)]">
              {spanish ? 'Validez (horas)' : 'Validity (hours)'}
              <input type="number" min="1" max="720" value={hours} onChange={(e) => setHours(e.target.value)} className="w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-[13px] text-[var(--ink)]" />
            </label>
            <button disabled={loading} className="rounded-xl bg-[var(--palm)] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-60">
              {loading ? '…' : (spanish ? 'Crear código' : 'Generate code')}
            </button>
          </form>
          {issuedCode && <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <p className="text-[10px] text-[var(--ink-soft)] mb-1">{spanish ? 'Código de un solo uso' : 'Single-use activation code'}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-[13px] font-black text-[var(--ink)]">{issuedCode}</code>
              <button type="button" onClick={() => navigator.clipboard?.writeText(issuedCode)} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink)]" aria-label="Copy activation code"><Clipboard className="w-4 h-4" /></button>
            </div>
          </div>}
        </div>
        <div className="flex items-center justify-between">
          <b className="text-[13px] text-[var(--ink)]">{spanish ? 'Solicitudes de proveedores' : 'Supplier applications'} ({applications.length})</b>
          <button type="button" onClick={() => loadApplications().catch((err) => setError(err.message))} className="p-2 rounded-lg border border-[var(--line)] text-[var(--ink-soft)]"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {applications.length === 0 && <p className="rounded-xl bg-[var(--surface-2)] p-3 text-[12px] text-[var(--ink-soft)]">{spanish ? 'Todavía no hay solicitudes.' : 'No supplier applications yet.'}</p>}
        {applications.map((item) => <article key={item.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div><b className="text-[13px] text-[var(--ink)]">{item.business_name}</b><p className="text-[11px] text-[var(--ink-soft)]">{item.contact_name} · {item.email}</p></div>
            <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[10px] font-bold text-[var(--ink-soft)]">{item.status.replace('_',' ')}</span>
          </div>
          <p className="text-[11px] text-[var(--ink-soft)]">{item.phone} · {item.island_location}{item.physical_address ? ` · ${item.physical_address}` : ''}</p>
          {item.status === 'pending_review' && <div className="flex gap-2">
            <button type="button" disabled={loading} onClick={() => reviewApplication(item, 'approved')} className="flex-1 rounded-xl bg-[var(--palm)] px-3 py-2 text-[11px] font-bold text-white">{spanish ? 'Aprobar' : 'Approve'}</button>
            <button type="button" disabled={loading} onClick={() => reviewApplication(item, 'rejected')} className="rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold text-red-600">{spanish ? 'Rechazar' : 'Reject'}</button>
          </div>}
        </article>)}
        <div className="border-t border-[var(--line)] pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between"><b className="text-[13px] text-[var(--ink)]">{spanish ? 'Reportes de identificación' : 'Identification reports'} ({identificationReports.filter(r => r.status === 'pending_review').length} {spanish ? 'pendientes' : 'pending'})</b><button type="button" onClick={() => loadIdentificationReports().catch(err => setError(err.message))} className="p-2 rounded-lg border border-[var(--line)] text-[var(--ink-soft)]"><RefreshCw className="w-4 h-4" /></button></div>
          {identificationReports.length === 0 && <p className="rounded-xl bg-[var(--surface-2)] p-3 text-[12px] text-[var(--ink-soft)]">{spanish ? 'Aún no hay reportes.' : 'No identification reports yet.'}</p>}
          {identificationReports.map(item => <article key={item.id} className="rounded-xl border border-[var(--line)] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2"><b className="text-[12px] text-[var(--ink)]">{item.ai_common_name || item.ai_scientific_name || 'Uncertain identification'}</b><span className="text-[10px] text-[var(--ink-soft)]">{item.status.replace('_',' ')}</span></div>
            <p className="text-[11px] text-[var(--ink-soft)]">{spanish ? 'IA' : 'AI'}: {item.ai_common_name || '—'} · {item.ai_scientific_name || '—'}</p>
            <p className="text-[11px] text-[var(--ink-soft)]">{spanish ? 'Corrección' : 'Supplier correction'}: {item.corrected_common_name || '—'} · {item.corrected_scientific_name || '—'}</p>
            <p className="text-[12px] text-[var(--ink)]">{item.report_notes}</p>
            {item.image_url && <img src={item.image_url} alt="Reported specimen" className="w-full max-h-36 rounded-lg object-cover" />}
            {item.status === 'pending_review' && <div className="flex gap-2"><button type="button" disabled={loading} onClick={() => reviewIdentificationReport(item, 'reviewed')} className="flex-1 rounded-lg border border-[var(--line)] p-2 text-[11px] font-bold text-[var(--ink)]">{spanish ? 'Revisado' : 'Mark reviewed'}</button><button type="button" disabled={loading} onClick={() => reviewIdentificationReport(item, 'resolved')} className="flex-1 rounded-lg bg-[var(--palm)] p-2 text-[11px] font-bold text-white">{spanish ? 'Resuelto' : 'Resolve'}</button><button type="button" disabled={loading} onClick={() => reviewIdentificationReport(item, 'dismissed')} className="rounded-lg border border-[var(--line)] p-2 text-[11px] font-bold text-[var(--ink-soft)]">{spanish ? 'Descartar' : 'Dismiss'}</button></div>}
          </article>)}
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-[12px] text-red-700">{error}</p>}
        {message && <p className="rounded-xl bg-emerald-50 p-2.5 text-[12px] text-emerald-800">{message}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[var(--palm)]" /><b className="text-[14px] text-[var(--ink)]">{spanish ? 'Cuenta de proveedor' : 'Supplier account'}</b></div>
      {application ? (
        <div className="rounded-xl bg-[var(--surface-2)] p-3">
          <div className="flex items-center gap-2 text-[var(--palm)]"><CheckCircle2 className="w-4 h-4" /><b className="text-[12px]">{spanish ? 'Solicitud registrada' : 'Application on file'}</b></div>
          <p className="mt-1 text-[12px] text-[var(--ink)]">{application.business_name}</p>
          <p className="text-[11px] text-[var(--ink-soft)]">{spanish ? 'Estado' : 'Status'}: {application.status.replace('_',' ')}</p>
          <p className="mt-2 text-[11px] text-[var(--ink-soft)]">{application.status === 'approved'
            ? (spanish ? 'Tu vivero está aprobado. La publicación de productos requiere revisión.' : 'Your nursery is approved. Product publication still requires review.')
            : (spanish ? 'No puedes publicar productos hasta que el administrador apruebe tu solicitud.' : 'You cannot publish products until the administrator approves your application.')}</p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-[var(--ink-soft)]">{spanish ? 'Usa el código privado que te entregó el administrador. La solicitud será revisada antes de activar tu vivero.' : 'Use the private code issued by the administrator. Your application is reviewed before your nursery is activated.'}</p>
          <form onSubmit={redeemCode} className="flex flex-col gap-2">
            <input required value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder={spanish ? 'Código de activación' : 'Activation code'} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink)]" />
            <input required minLength={2} maxLength={160} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder={spanish ? 'Nombre del negocio' : 'Business name'} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink)]" />
            <input required minLength={2} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={spanish ? 'Persona de contacto' : 'Contact person'} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink)]" />
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={spanish ? 'Teléfono' : 'Phone'} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink)]" />
            <input required type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} placeholder="Business email" className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink)]" />
            <input required value={location} onChange={(e) => setLocation(e.target.value)} placeholder={spanish ? 'Ubicación en la isla' : 'Island location'} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink)]" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={spanish ? 'Dirección física (opcional)' : 'Physical address (optional)'} className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink)]" />
            <button disabled={loading} className="rounded-xl bg-[var(--palm)] px-3 py-2.5 text-[12px] font-bold text-white disabled:opacity-60">{loading ? '…' : (spanish ? 'Enviar solicitud' : 'Submit supplier application')}</button>
          </form>
        </>
      )}
      {application?.status === 'approved' && <SupplierProductWorkspace session={session} lang={lang} />}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-[12px] text-red-700">{error}</p>}
      {message && <p className="rounded-xl bg-emerald-50 p-2.5 text-[12px] text-emerald-800">{message}</p>}
    </section>
  );
};
