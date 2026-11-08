import React, { useEffect, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { AIAnalysisResult, AuthSession, Language } from '../types';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../data/initialData';
import { analyzeBotanicalImage, compressImage } from '../services/api';

type PhotoQuality = { score: number; status: 'acceptable' | 'needs_attention'; width: number; height: number; notes: string[] };

async function inspectPhotoQuality(file: File): Promise<PhotoQuality> {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Photo quality inspection is unavailable on this device.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Float32Array(canvas.width * canvas.height);
  let total = 0;
  let totalSquared = 0;
  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    const value = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    gray[p] = value;
    total += value;
    totalSquared += value * value;
  }
  const count = gray.length;
  const brightness = total / count;
  const contrast = Math.sqrt(Math.max(0, totalSquared / count - brightness * brightness));
  let laplacianTotal = 0;
  let laplacianSquared = 0;
  let samples = 0;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const k = y * canvas.width + x;
      const value = gray[k - canvas.width] + gray[k - 1] - 4 * gray[k] + gray[k + 1] + gray[k + canvas.width];
      laplacianTotal += value;
      laplacianSquared += value * value;
      samples += 1;
    }
  }
  const sharpness = Math.max(0, laplacianSquared / samples - Math.pow(laplacianTotal / samples, 2));
  const notes: string[] = [];
  const resolutionOk = width >= 800 && height >= 600;
  const exposureOk = brightness >= 28 && brightness <= 232;
  const contrastOk = contrast >= 18;
  const sharpnessOk = sharpness >= 10;
  if (!resolutionOk) notes.push('Low resolution: use an image at least 800 × 600 pixels.');
  if (!exposureOk) notes.push(brightness < 28 ? 'Photo is too dark.' : 'Photo is overexposed.');
  if (!contrastOk) notes.push('Low contrast: the subject may be difficult to distinguish.');
  if (!sharpnessOk) notes.push('Possible blur: retake the photo with the camera steady and focused.');
  const score = Math.max(0, Math.min(100,
    (resolutionOk ? 25 : Math.min(20, 25 * Math.min(width / 800, height / 600))) +
    (exposureOk ? 25 : 8) +
    (contrastOk ? 20 : 8) +
    (sharpnessOk ? 30 : Math.min(18, sharpness * 1.2))
  ));
  return { score: Math.round(score), status: notes.length ? 'needs_attention' : 'acceptable', width, height, notes };
}

type Nursery = { id: string; name: string };
type Identification = { common: string; scientific: string; confidence: number | null; model: string; status: 'identified' | 'uncertain' };

async function uploadSupplierPhoto(productId: string, userId: string, dataUrl: string, token: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userId}/${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'false' }, body: blob });
  const uploaded = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(uploaded.message || uploaded.error || 'Product photo upload failed.');
  const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${path.split('/').map(encodeURIComponent).join('/')}`;
  await rest(`products?id=eq.${encodeURIComponent(productId)}`, token, { method: 'PATCH', body: JSON.stringify({ image_url: imageUrl }) });
  return imageUrl;
}

async function rest(path: string, token: string, init?: RequestInit) {
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
  if (!response.ok) throw new Error(payload.message || payload.details || payload.error || 'Supplier workspace request failed.');
  return payload;
}

export const SupplierProductWorkspace: React.FC<{ session: AuthSession; lang: Language }> = ({ session, lang }) => {
  const es = lang === 'es';
  const [nursery, setNursery] = useState<Nursery | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [photoQuality, setPhotoQuality] = useState<PhotoQuality | null>(null);
  const [name, setName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [category, setCategory] = useState('plant');
  const [description, setDescription] = useState('');
  const [care, setCare] = useState('');
  const [size, setSize] = useState('');
  const [salt, setSalt] = useState('2');
  const [sunlight, setSunlight] = useState('');
  const [watering, setWatering] = useState('');
  const [petSafety, setPetSafety] = useState<'safe' | 'check'>('check');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'HNL' | 'USD'>('HNL');
  const [stock, setStock] = useState('1');
  const [reportNotes, setReportNotes] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [submittedProductId, setSubmittedProductId] = useState('');
  const [submittedImageUrl, setSubmittedImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    rest(`nurseries?select=id,name&owner_id=eq.${encodeURIComponent(session.user.id)}&limit=1`, session.access_token)
      .then(rows => { if (active && Array.isArray(rows) && rows[0]) setNursery(rows[0]); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [session.access_token, session.user.id]);

  const selectPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError(es ? 'Selecciona una imagen válida.' : 'Choose a valid image file.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError(es ? 'La imagen debe pesar menos de 15 MB.' : 'Image must be smaller than 15 MB.'); return; }
    setError(''); setMessage(''); setAnalysis(null); setPhotoQuality(null); setSubmittedProductId(''); setSubmittedImageUrl(''); setPhoto(file);
    try { setPhotoQuality(await inspectPhotoQuality(file)); } catch (qualityError) { setError(qualityError instanceof Error ? qualityError.message : 'Photo quality check failed.'); return; }
    const preview = await compressImage(file, 1400, 0.84);
    setPhotoPreview(preview);
    setAnalyzing(true);
    try {
      const aiImage = await compressImage(file, 1000, 0.78);
      const result = await analyzeBotanicalImage('plant', aiImage, lang, session.access_token);
      setAnalysis(result);
      const record = result.verified_botanical_record;
      const candidate = result.candidates?.[0];
      const suggestedName = record?.common_name || candidate?.common_name || '';
      const suggestedScientific = record?.scientific_name || candidate?.scientific_name || '';
      setName(suggestedName);
      setScientificName(suggestedScientific);
      setDescription(record?.botanical_description || '');
      setSunlight(record?.care?.sunlight_requirement || '');
      setWatering(record?.care?.watering_instructions || '');
      setSalt(String(record?.characteristics?.salt_tolerance_rating || 2));
      const careInfo = record?.care;
      setCare(careInfo ? [careInfo.sunlight_requirement, careInfo.watering_instructions, careInfo.soil_requirements, careInfo.fertilization_instructions, careInfo.pruning_instructions].filter(Boolean).join('\n') : '');
      if (!suggestedName || !suggestedScientific) setMessage(es ? 'La identificación es incierta. Completa y corrige los campos manualmente antes de enviar.' : 'Identification is uncertain. Complete and correct the fields manually before submission.');
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : 'Photo identification failed.');
    } finally { setAnalyzing(false); }
  };

  const submitListing = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nursery) { setError(es ? 'No encontramos un vivero aprobado para esta cuenta.' : 'No approved nursery was found for this account.'); return; }
    if (!photo || !photoPreview || !analysis || !photoQuality) { setError(es ? 'Sube una foto y completa primero el análisis de inteligencia.' : 'Upload a photo and complete the intelligence analysis first.'); return; }
    if (!name.trim() || !scientificName.trim() || !category.trim() || !description.trim() || !care.trim() || !size.trim() || !sunlight.trim() || !watering.trim() || !price || !stock) {
      setError(es ? 'Completa todos los parámetros obligatorios.' : 'Complete every required listing parameter.'); return;
    }
    if (!Number.isFinite(Number(price)) || Number(price) <= 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
      setError(es ? 'Revisa el precio y la cantidad disponible.' : 'Check the price and stock quantity.'); return;
    }
    setLoading(true); setError(''); setMessage('');
    let createdId = '';
    try {
      const candidate = analysis.candidates?.[0];
      const record = analysis.verified_botanical_record;
      const confidence = Number(candidate?.confidence_score);
      const rows = await rest('products', session.access_token, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          nursery_id: nursery.id,
          created_by: session.user.id,
          name: name.trim(),
          scientific_name: scientificName.trim(),
          category: category.trim(),
          description: description.trim(),
          description_en: description.trim(),
          care_instructions_en: care.trim(),
          size: size.trim(),
          salt_tolerance_rating: Number(salt),
          sunlight_requirement: sunlight.trim(),
          watering_instructions: watering.trim(),
          pet_safety: petSafety,
          price: Number(price),
          currency,
          stock_quantity: Number(stock),
          is_active: false,
          listing_status: 'pending_review',
          image_review_status: 'pending',
          ai_identified_common_name: record?.common_name || candidate?.common_name || null,
          ai_identified_scientific_name: record?.scientific_name || candidate?.scientific_name || null,
          ai_identification_confidence: Number.isFinite(confidence) ? confidence : null,
          ai_identification_model: analysis.model_used || null,
          ai_identification_status: (record?.common_name || candidate?.common_name) ? 'identified' : 'uncertain',
          photo_quality_score: photoQuality.score,
          photo_quality_status: photoQuality.status,
          photo_quality_notes: photoQuality.notes.join(' '),
          photo_width: photoQuality.width,
          photo_height: photoQuality.height,
          photo_file_size_bytes: photo.size
        })
      });
      if (!Array.isArray(rows) || !rows[0]?.id) throw new Error('The listing was not returned after saving.');
      createdId = rows[0].id;
      const imageUrl = await uploadSupplierPhoto(createdId, session.user.id, photoPreview, session.access_token);
      setSubmittedImageUrl(imageUrl);
      setMessage(es ? 'Producto enviado para revisión. No será visible hasta la aprobación del administrador.' : 'Listing submitted for review. It will remain hidden until an administrator approves it.');
      setSubmittedProductId(createdId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit listing.');
      if (createdId) setMessage(es ? 'El registro se creó, pero la foto no se pudo guardar. Contacta al administrador antes de volver a enviarlo.' : 'The listing record was created, but its photo did not save. Contact an administrator before resubmitting.');
    } finally { setLoading(false); }
  };

  const reportIncorrect = async () => {
    if (!reportNotes.trim()) { setError(es ? 'Describe qué identificación es incorrecta.' : 'Explain what is incorrect about the identification.'); return; }
    const candidate = analysis?.candidates?.[0];
    const record = analysis?.verified_botanical_record;
    setLoading(true); setError('');
    try {
      const productId = submittedProductId;
      if (!productId) throw new Error(es ? 'Primero envía el producto para revisión.' : 'Submit the listing for review first.');
      await rest('supplier_identification_reports', session.access_token, {
        method: 'POST',
        body: JSON.stringify({
          product_id: productId,
          supplier_user_id: session.user.id,
          ai_common_name: record?.common_name || candidate?.common_name || null,
          ai_scientific_name: record?.scientific_name || candidate?.scientific_name || null,
          corrected_common_name: name.trim() || null,
          corrected_scientific_name: scientificName.trim() || null,
          report_notes: reportNotes.trim(),
          image_url: submittedImageUrl || null
        })
      });
      await rest('products?id=eq.' + encodeURIComponent(productId), session.access_token, {
        method: 'PATCH',
        body: JSON.stringify({ ai_identification_status: 'reported_incorrect' })
      });
      setMessage(es ? 'Reporte enviado al equipo de revisión.' : 'Your identification report has been sent for review.');
      setReportOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit the report.'); }
    finally { setLoading(false); }
  };

  if (!nursery) return <div className="rounded-xl border border-[var(--line)] p-3 text-[12px] text-[var(--ink-soft)]">{es ? 'Preparando el espacio de productos del vivero…' : 'Loading your nursery product workspace…'}</div>;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col gap-3">
      <div><b className="text-[14px] text-[var(--ink)]">{es ? 'Productos de mi vivero' : 'My nursery products'}</b><p className="text-[11px] text-[var(--ink-soft)]">{nursery.name} · {es ? 'Cada foto se analiza antes de enviar el producto.' : 'Every photo is analyzed before the listing is submitted.'}</p></div>
      <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-3 text-[12px] font-bold text-[var(--ink)] cursor-pointer">
        <Camera className="w-4 h-4" />{photo ? photo.name : (es ? 'Subir foto del producto o planta' : 'Upload plant photo')}
        <input type="file" accept="image/*" className="sr-only" onChange={e => { void selectPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {photoPreview && <img src={photoPreview} alt="Supplier upload preview" className="w-full max-h-52 rounded-xl object-cover" />}
      {photoQuality && <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[11px]">
        <div className="flex items-center justify-between gap-2"><b className="text-[var(--ink)]">{es ? 'Revisión técnica de foto' : 'Photo quality check'}</b><b className={photoQuality.status === 'acceptable' ? 'text-[var(--palm)]' : 'text-amber-700'}>{photoQuality.score}/100 · {photoQuality.status === 'acceptable' ? (es ? 'Aceptable' : 'Acceptable') : (es ? 'Necesita atención' : 'Needs attention')}</b></div>
        <p className="mt-1 text-[var(--ink-soft)]">{photoQuality.width} × {photoQuality.height}px · {(photo.size / 1024).toFixed(0)} KB</p>
        {photoQuality.notes.length > 0 && <ul className="mt-1 list-disc pl-4 text-amber-700">{photoQuality.notes.map(note => <li key={note}>{note}</li>)}</ul>}
        <p className="mt-1 text-[var(--ink-soft)]">{es ? 'Esta comprobación estima resolución, exposición, contraste y nitidez. El administrador revisará la foto antes de publicar.' : 'This check estimates resolution, exposure, contrast and sharpness. An administrator still reviews the image before publication.'}</p>
      </div>}
      {analyzing && <p className="flex items-center gap-2 text-[12px] text-[var(--palm)]"><Loader2 className="w-4 h-4 animate-spin" />{es ? 'RootWise Intelligence identificando la planta…' : 'RootWise Intelligence is identifying the plant…'}</p>}
      {analysis && <div className="rounded-xl bg-[var(--surface-2)] p-3 text-[12px]"><p className="flex items-center gap-2 font-bold text-[var(--palm)]"><Sparkles className="w-4 h-4" />{es ? 'Identificación sugerida por inteligencia' : 'Intelligence identification suggestion'}</p><p className="mt-1 text-[var(--ink)]">{analysis.verified_botanical_record?.common_name || analysis.candidates?.[0]?.common_name || (es ? 'Sin identificación concluyente' : 'No conclusive identification')} · {analysis.verified_botanical_record?.scientific_name || analysis.candidates?.[0]?.scientific_name || '—'}</p><p className="text-[10px] text-[var(--ink-soft)]">{es ? 'Verifica y edita todos los datos. La IA puede equivocarse.' : 'Review and edit all details. AI can be wrong.'}</p></div>}
      <form onSubmit={submitListing} className="flex flex-col gap-2">
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? 'Nombre común *' : 'Common name *'}<input required value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? 'Nombre científico *' : 'Scientific name *'}<input required value={scientificName} onChange={e => setScientificName(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? 'Categoría *' : 'Category *'}<select required value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]"><option value="plant">Plant / Planta</option><option value="palm">Palm / Palmera</option><option value="shrub">Shrub / Arbusto</option><option value="flower">Flower / Flor</option><option value="grass">Grass / Césped</option></select></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? 'Descripción *' : 'Description *'}<textarea required value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? 'Instrucciones de cuidado *' : 'Care instructions *'}<textarea required value={care} onChange={e => setCare(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? "Tamaño / presentación *" : "Size / pot or package *"}<input required value={size} onChange={e => setSize(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? "Tolerancia a sal (1–3) *" : "Salt tolerance (1–3) *"}<select required value={salt} onChange={e => setSalt(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]"><option value="1">1 · Low</option><option value="2">2 · Moderate</option><option value="3">3 · High</option></select></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? "Requisito de luz solar *" : "Sunlight requirement *"}<input required value={sunlight} onChange={e => setSunlight(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? "Instrucciones de riego *" : "Watering instructions *"}<input required value={watering} onChange={e => setWatering(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? "Seguridad para mascotas *" : "Pet safety *"}<select required value={petSafety} onChange={e => setPetSafety(e.target.value as "safe" | "check")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]"><option value="safe">{es ? "Seguro conocido" : "Known safe"}</option><option value="check">{es ? "Verificar" : "Check first"}</option></select></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-[var(--ink-soft)]">{es ? 'Precio *' : 'Price *'}<input required type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
          <label className="text-[11px] text-[var(--ink-soft)]">{es ? 'Moneda *' : 'Currency *'}<select value={currency} onChange={e => setCurrency(e.target.value as 'HNL' | 'USD')} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]"><option value="HNL">HNL</option><option value="USD">USD</option></select></label>
        </div>
        <label className="text-[11px] text-[var(--ink-soft)]">{es ? 'Cantidad disponible *' : 'Available stock *'}<input required type="number" min="0" step="1" value={stock} onChange={e => setStock(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[13px] text-[var(--ink)]" /></label>
        <button type="submit" disabled={loading || analyzing || !analysis || !photo || Boolean(submittedProductId)} className="rounded-xl bg-[var(--palm)] p-3 text-[12px] font-bold text-white disabled:opacity-50">{loading ? '…' : (es ? 'Enviar para revisión' : 'Submit for review')}</button>
      </form>
      {analysis && <div className="border-t border-[var(--line)] pt-3"><button type="button" disabled={!submittedProductId} onClick={() => setReportOpen(!reportOpen)} className="text-[12px] font-bold text-[var(--bloom)] flex items-center gap-2 disabled:opacity-40"><AlertCircle className="w-4 h-4" />{es ? 'Reportar identificación incorrecta' : 'Report incorrect identification'}</button>{!submittedProductId && <p className="mt-1 text-[10px] text-[var(--ink-soft)]">{es ? 'Envía primero el producto para poder adjuntar el reporte.' : 'Submit the listing first to attach an identification report.'}</p>}{reportOpen && <div className="mt-2 flex flex-col gap-2"><textarea value={reportNotes} onChange={e => setReportNotes(e.target.value)} required rows={3} placeholder={es ? 'Explica qué identificó mal RootWise…' : 'Explain what RootWise identified incorrectly…'} className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2 text-[12px] text-[var(--ink)]" /><button type="button" disabled={loading} onClick={() => void reportIncorrect()} className="rounded-xl border border-[var(--line)] p-2 text-[12px] font-bold text-[var(--ink)]">{es ? 'Enviar reporte' : 'Send report'}</button></div>}</div>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-[11px] text-red-700">{error}</p>}
      {message && <p className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] p-2 text-[11px] text-[var(--ink)]"><CheckCircle2 className="h-4 w-4 text-[var(--palm)]" />{message}</p>}
    </section>
  );
};
