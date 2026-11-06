import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BotanicalAssistantMessage,
  BotanicalDocument,
  BotanicalProfile,
  DuplicateTaxonCandidate,
  KnowledgeHealthAudit,
  KnowledgeVisibility,
  RAGFilterConfig,
  RAGIndexStats,
  RAGTestQueryResult
} from '../../types/botanicalKnowledge';
import { CatalogItem, Language } from '../../types';
import { botanicalKnowledgeService } from '../../services/botanicalKnowledgeService';
import { BotanicalProfileEditorModal } from './BotanicalProfileEditorModal';
import { DocumentDetailModal } from './DocumentDetailModal';
import { DuplicateMergerModal } from './DuplicateMergerModal';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  Database,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Flower2,
  GitMerge,
  Globe2,
  HeartPulse,
  HelpCircle,
  Info,
  Layers,
  Leaf,
  Link,
  MapPin,
  MessageSquare,
  Palmtree,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Shovel,
  Sliders,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  Upload,
  UploadCloud,
  Wind,
  X
} from 'lucide-react';

interface BotanicalKnowledgeCenterProps {
  lang: Language;
  catalogItems?: CatalogItem[];
  isAdmin: boolean;
  onOpenStoreItem?: (item: CatalogItem) => void;
}

export type CenterTab =
  | 'overview'
  | 'documents'
  | 'database'
  | 'taxonomy'
  | 'extraction_review'
  | 'rag_playground'
  | 'regional'
  | 'assistant';

export const BotanicalKnowledgeCenter: React.FC<BotanicalKnowledgeCenterProps> = ({
  lang,
  catalogItems = [],
  isAdmin,
  onOpenStoreItem
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<CenterTab>('overview');

  // Core Data from Service
  const [profiles, setProfiles] = useState<BotanicalProfile[]>(() =>
    botanicalKnowledgeService.getProfiles()
  );
  const [documents, setDocuments] = useState<BotanicalDocument[]>(() =>
    botanicalKnowledgeService.getDocuments()
  );
  const [overview, setOverview] = useState(() =>
    botanicalKnowledgeService.getOverviewMetrics()
  );
  const [healthAudit, setHealthAudit] = useState<KnowledgeHealthAudit>(() =>
    botanicalKnowledgeService.getKnowledgeHealthAudit()
  );
  const [duplicates, setDuplicates] = useState<DuplicateTaxonCandidate[]>(() =>
    botanicalKnowledgeService.getDuplicateCandidates()
  );

  // Modals state
  const [editingProfile, setEditingProfile] = useState<BotanicalProfile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [inspectingDoc, setInspectingDoc] = useState<BotanicalDocument | null>(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [mergingCandidate, setMergingCandidate] = useState<DuplicateTaxonCandidate | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  // Notifications / feedback
  const [toast, setToast] = useState<string | null>(null);
  const showFeedback = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const refreshState = () => {
    setProfiles([...botanicalKnowledgeService.getProfiles()]);
    setDocuments([...botanicalKnowledgeService.getDocuments()]);
    setOverview(botanicalKnowledgeService.getOverviewMetrics());
    setHealthAudit(botanicalKnowledgeService.getKnowledgeHealthAudit());
    setDuplicates([...botanicalKnowledgeService.getDuplicateCandidates()]);
  };

  // ------------------------------------------------------------------
  // SECTION 4: FILE UPLOAD DRAG-AND-DROP HANDLERS
  // ------------------------------------------------------------------
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessUploadedFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let contentText = '';
        if (file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
          contentText = await file.text();
        } else {
          contentText = `Uploaded document stream for ${file.name} (Binary / Container format). Initializing text and taxonomic extraction pipeline.`;
        }

        await botanicalKnowledgeService.uploadBotanicalDocument(
          {
            name: file.name,
            size: file.size,
            type: file.type,
            sourceFile: file,
            contentText
          },
          'Verde Administrator'
        );
      }
      refreshState();
      showFeedback(
        lang === 'es'
          ? '¡Documento recibido! Iniciando tubería de extracción botánica de 12 etapas.'
          : 'Document received! Initiated 12-stage botanical extraction pipeline.'
      );
    } catch (err: any) {
      showFeedback(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // ------------------------------------------------------------------
  // SECTION 5: BOTANICAL DATABASE FILTERING & SEARCH
  // ------------------------------------------------------------------
  const [dbSearch, setDbSearch] = useState('');
  const [dbFamilyFilter, setDbFamilyFilter] = useState('all');
  const [dbHabitFilter, setDbHabitFilter] = useState('all');
  const [dbVisibilityFilter, setDbVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [dbSaltFilter, setDbSaltFilter] = useState<number | 'all'>('all');

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (dbVisibilityFilter !== 'all' && p.visibility !== dbVisibilityFilter) return false;
      if (dbFamilyFilter !== 'all' && p.taxonomy.family.toLowerCase() !== dbFamilyFilter.toLowerCase()) return false;
      if (dbHabitFilter !== 'all' && p.identification.growth_habit !== dbHabitFilter) return false;
      if (dbSaltFilter !== 'all' && p.regional.salt_tolerance_level !== dbSaltFilter) return false;

      if (dbSearch.trim()) {
        const q = dbSearch.toLowerCase();
        const matchSci = p.taxonomy.scientific_name.toLowerCase().includes(q);
        const matchFam = p.taxonomy.family.toLowerCase().includes(q);
        const matchEn = p.identification.common_names.en.some((n) => n.toLowerCase().includes(q));
        const matchEs = p.identification.common_names.es.some((n) => n.toLowerCase().includes(q));
        const matchSyn = p.taxonomy.synonyms.some((s) => s.toLowerCase().includes(q));
        return matchSci || matchFam || matchEn || matchEs || matchSyn;
      }
      return true;
    });
  }, [profiles, dbSearch, dbFamilyFilter, dbHabitFilter, dbVisibilityFilter, dbSaltFilter]);

  const uniqueFamilies = useMemo(() => {
    return Array.from(new Set(profiles.map((p) => p.taxonomy.family))).sort();
  }, [profiles]);

  // ------------------------------------------------------------------
  // SECTION 6: EXTERNAL TAXONOMY LOOKUP
  // ------------------------------------------------------------------
  const [externalTaxonQuery, setExternalTaxonQuery] = useState('');
  const [externalSource, setExternalSource] = useState<'kew_powo' | 'gbif' | 'world_flora_online'>('kew_powo');
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalResult, setExternalResult] = useState<any | null>(null);

  const handleExternalLookup = async () => {
    if (!externalTaxonQuery.trim()) return;
    setExternalLoading(true);
    try {
      const res = await botanicalKnowledgeService.queryExternalBotanicalReference(
        externalTaxonQuery.trim(),
        externalSource
      );
      setExternalResult(res);
    } finally {
      setExternalLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // SECTION 8: RAG PLAYGROUND
  // ------------------------------------------------------------------
  const [ragQuery, setRagQuery] = useState('What plants thrive in Roatán coralline limestone soil with high beachfront salt spray?');
  const [ragConfig, setRagConfig] = useState<RAGFilterConfig>({
    search_method: 'hybrid',
    similarity_threshold: 0.65,
    max_retrieved_results: 4,
    language_filter: 'all',
    regional_scope: 'roatan',
    visibility_filter: 'all',
    source_filter: 'all'
  });
  const [ragLoading, setRagLoading] = useState(false);
  const [ragResult, setRagResult] = useState<RAGTestQueryResult | null>(null);

  const handleExecuteRAGPlayground = async () => {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    try {
      const result = await botanicalKnowledgeService.runRAGTestQuery(ragQuery, ragConfig);
      setRagResult(result);
    } finally {
      setRagLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // SECTION 9: AI BOTANICAL ASSISTANT CONVERSATION
  // ------------------------------------------------------------------
  const [chatMessages, setChatMessages] = useState<BotanicalAssistantMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      timestamp: new Date().toISOString(),
      content: lang === 'es'
        ? '¡Hola! Soy el **Motor de Inteligencia Botánica de Verde Roatán**. Consulta sobre taxonomía científica, requerimientos de suelo calizo, resistencia a salinidad marina o enfermedades de plantas tropicales.'
        : 'Welcome! I am the **Verde Roatán Botanical Intelligence Engine**. Ask me about scientific taxonomy, coralline limestone soil protocols, beachfront salt spray tolerance, or tropical plant health.',
      accuracy_badge: 'verified_database',
      accuracy_explanation: lang === 'es'
        ? 'Respaldado por el herbario botánico y catálogo científico verificado de Verde.'
        : 'Backed by verified Verde Herbarium records and authoritative reference literature.',
      suggested_follow_ups: lang === 'es'
        ? [
            '¿Qué plantas costeras toleran brisa marina de West Bay?',
            '¿Cómo mejorar suelo calizo de la isla?',
            '¿Es tóxica la Monstera deliciosa para mascotas?'
          ]
        : [
            'Which coastal plants withstand West Bay salt spray?',
            'How to amend Roatán coralline limestone ground?',
            'Is Monstera deliciosa toxic to pets?'
          ]
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const handleSendChatMessage = async (questionText?: string) => {
    const q = questionText || chatInput;
    if (!q.trim()) return;

    const userMsg: BotanicalAssistantMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toISOString(),
      content: q,
      accuracy_badge: 'verified_database',
      accuracy_explanation: ''
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!questionText) setChatInput('');
    setChatLoading(true);

    try {
      // 1. Retrieve RAG candidates
      const ragResults = await botanicalKnowledgeService.runRAGTestQuery(q, {
        search_method: 'hybrid',
        similarity_threshold: 0.6,
        max_retrieved_results: 3,
        language_filter: 'all',
        regional_scope: 'roatan',
        visibility_filter: 'all',
        source_filter: 'all'
      });

      // 2. Query Assistant endpoint on backend
      const res = await fetch('/api/botanical/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          lang,
          retrievedPassages: ragResults.retrieved_passages,
          matchedProfiles: profiles.slice(0, 3)
        })
      });

      if (res.ok) {
        const payload = await res.json();
        const assistantMsg: BotanicalAssistantMessage = {
          id: `asst-${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toISOString(),
          content: payload.content,
          accuracy_badge: payload.accuracy_badge || 'verified_database',
          accuracy_explanation: payload.accuracy_explanation || '',
          citations: payload.citations || [],
          suggested_follow_ups: payload.suggested_follow_ups || [],
          referenced_botanical_profiles: profiles.slice(0, 1).map((p) => ({
            id: p.id,
            scientific_name: p.taxonomy.scientific_name,
            common_name: p.identification.common_names.en[0],
            thumbnail: p.media[0]?.url
          }))
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Local service fallback
        const fallback = await botanicalKnowledgeService.queryBotanicalAssistant(q, lang);
        setChatMessages((prev) => [...prev, fallback]);
      }
    } catch {
      const fallback = await botanicalKnowledgeService.queryBotanicalAssistant(q, lang);
      setChatMessages((prev) => [...prev, fallback]);
    } finally {
      setChatLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // SECTION 10: REGIONAL BOTANICAL INTELLIGENCE
  // ------------------------------------------------------------------
  const [regionalZone, setRegionalZone] = useState<'all' | 'roatan' | 'honduras' | 'caribbean'>('roatan');
  const [regCoastalFilter, setRegCoastalFilter] = useState(false);
  const [regSaltLevelFilter, setRegSaltLevelFilter] = useState<number | 'all'>('all');
  const [regHurricaneFilter, setRegHurricaneFilter] = useState(false);
  const [regOriginFilter, setRegOriginFilter] = useState<'all' | 'native' | 'naturalized' | 'invasive'>('all');

  const regionalFilteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (regCoastalFilter && !p.regional.suitability_tropical_coastal) return false;
      if (regSaltLevelFilter !== 'all' && p.regional.salt_tolerance_level !== regSaltLevelFilter) return false;
      if (regHurricaneFilter && p.regional.wind_tolerance !== 'high_hurricane_resilient') return false;
      if (regOriginFilter === 'native' && p.regional.invasive_status !== 'native') return false;
      if (regOriginFilter === 'invasive' && !p.regional.invasive_status.includes('invasive')) return false;
      return true;
    });
  }, [profiles, regCoastalFilter, regSaltLevelFilter, regHurricaneFilter, regOriginFilter]);

  return (
    <div className="flex flex-col gap-4">
      {/* Botanical Knowledge Center Header Card */}
      <div className="bg-gradient-to-br from-[var(--palm)] via-[#15533c] to-[#0d3627] text-white rounded-3xl p-5 sm:p-6 shadow-md border border-[var(--line)]/20 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs flex items-center gap-1">
                <Compass className="w-3 h-3 text-emerald-300" />
                VERDE PLANT INTELLIGENCE
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-400 text-[#07201a]">
                RAG READY
              </span>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight font-display text-white">
              Botanical Knowledge Center
            </h1>
            <p className="text-[13px] text-white/80 max-w-2xl leading-relaxed">
              Scientific taxonomic database, document ingestion pipeline, pgvector RAG playground & regional Caribbean botanical intelligence for Roatán & Honduras.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setEditingProfile(null);
                setIsProfileModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-white text-[var(--palm)] font-extrabold text-[12.5px] shadow-sm hover:bg-emerald-50 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Botanical Record
            </button>
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-[12.5px] border border-white/20 transition-all flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              Upload Reference Document
            </button>
          </div>
        </div>

        {/* Hidden File Input for Document Upload */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.csv,.xls,.xlsx,.txt,.docx"
          className="hidden"
          onChange={(e) => handleProcessUploadedFiles(e.target.files)}
        />
      </div>

      {/* Navigation Subtabs Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bg-[var(--surface-2)] p-1.5 rounded-2xl no-scrollbar">
        {[
          { id: 'overview', label: 'Overview & Health', icon: Activity, count: healthAudit.overall_score_pct + '%' },
          { id: 'documents', label: 'Document Ingestion', icon: UploadCloud, count: documents.length },
          { id: 'database', label: 'Plant Database', icon: Sprout, count: profiles.length },
          { id: 'taxonomy', label: 'Taxonomy & Synonyms', icon: Layers, count: duplicates.length > 0 ? duplicates.length : undefined },
          { id: 'extraction_review', label: 'AI Extraction Review', icon: Sparkles, count: overview.pendingBotanicalReviews > 0 ? overview.pendingBotanicalReviews : undefined },
          { id: 'rag_playground', label: 'RAG Playground', icon: Cpu },
          { id: 'regional', label: 'Regional Honduras & Roatán', icon: MapPin },
          { id: 'assistant', label: 'AI Botanical Assistant', icon: MessageSquare }
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as CenterTab)}
              className={`py-2 px-3 rounded-xl text-[12px] font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                isActive
                  ? 'bg-[var(--palm)] text-white shadow-xs'
                  : 'text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
              {item.count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[var(--surface)] text-[var(--ink-soft)]'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toast Notice */}
      {toast && (
        <div className="p-3 bg-[var(--ink)] text-[var(--bg)] text-[12.5px] font-semibold rounded-2xl text-center shadow-lg animate-in fade-in duration-200">
          {toast}
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 1: OVERVIEW & KNOWLEDGE HEALTH DASHBOARD */}
      {/* ======================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Top Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                Total Botanical Records
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[24px] font-extrabold text-[var(--ink)]">
                  {overview.totalBotanicalRecords}
                </span>
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {overview.verifiedPlantRecords} verified
                </span>
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                Uploaded Documents
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[24px] font-extrabold text-[var(--ink)]">
                  {overview.totalUploadedDocuments}
                </span>
                <span className="text-[11px] font-bold text-[var(--palm)] bg-[var(--palm)]/10 px-2 py-0.5 rounded-full">
                  {overview.totalIndexedDocuments} indexed
                </span>
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                Pending Reviews
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[24px] font-extrabold text-amber-600">
                  {overview.pendingBotanicalReviews}
                </span>
                <span className="text-[11px] font-bold text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  Awaiting sign-off
                </span>
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                Public Knowledge
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[24px] font-extrabold text-[var(--ink)]">
                  {overview.publicKnowledgeRecords}
                </span>
                <span className="text-[11px] font-bold text-[var(--ink-soft)]">
                  {overview.privateAdministratorRecords} private
                </span>
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5 flex flex-col justify-between shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                Knowledge Health
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[24px] font-extrabold text-emerald-600">
                  {healthAudit.overall_score_pct}%
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Grade A
                </span>
              </div>
            </div>
          </div>

          {/* Health Audit & Actionable Issues */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-extrabold text-[var(--ink)] flex items-center gap-2">
                  <HeartPulse className="w-4.5 h-4.5 text-emerald-600" />
                  Botanical Knowledge Health & Taxonomic Audit
                </h3>
                <small className="text-[12px] text-[var(--ink-soft)] block">
                  Continuous data validation across taxonomic authorities, synonym consistency, and reference citations.
                </small>
              </div>
              <button
                type="button"
                onClick={refreshState}
                className="p-2 rounded-xl text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
                title="Run Health Audit"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-3 bg-[var(--surface-2)]/50 rounded-2xl border border-[var(--line)] text-center">
                <span className="text-[11px] font-bold text-[var(--ink-soft)] block">Missing Fields</span>
                <b className="text-[18px] text-[var(--ink)]">{healthAudit.missing_botanical_fields_count}</b>
              </div>
              <div className="p-3 bg-[var(--surface-2)]/50 rounded-2xl border border-[var(--line)] text-center">
                <span className="text-[11px] font-bold text-[var(--ink-soft)] block">Duplicate Names</span>
                <b className="text-[18px] text-amber-600">{healthAudit.duplicate_scientific_names_count}</b>
              </div>
              <div className="p-3 bg-[var(--surface-2)]/50 rounded-2xl border border-[var(--line)] text-center">
                <span className="text-[11px] font-bold text-[var(--ink-soft)] block">Unverified Records</span>
                <b className="text-[18px] text-amber-600">{healthAudit.unverified_records_count}</b>
              </div>
              <div className="p-3 bg-[var(--surface-2)]/50 rounded-2xl border border-[var(--line)] text-center">
                <span className="text-[11px] font-bold text-[var(--ink-soft)] block">Missing Citations</span>
                <b className="text-[18px] text-emerald-600">{healthAudit.missing_source_references_count}</b>
              </div>
            </div>

            {/* Issues List */}
            {healthAudit.issues.length > 0 && (
              <div className="space-y-2 pt-2">
                <b className="text-[12px] font-bold text-[var(--ink)] block">Action Items:</b>
                {healthAudit.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3 bg-[var(--surface-2)]/30 rounded-2xl border border-[var(--line)] flex items-start justify-between gap-3 text-[12px]"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-[var(--ink)]">
                          {issue.category} · {issue.record_name}
                        </div>
                        <p className="text-[var(--ink-soft)]">{issue.description}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-extrabold text-[var(--palm)] bg-[var(--palm)]/10 px-2.5 py-1 rounded-xl shrink-0">
                      {issue.action_required}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 2: DOCUMENT UPLOAD & INGESTION CENTER */}
      {/* ======================================================= */}
      {activeTab === 'documents' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Upload Drag & Drop Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleProcessUploadedFiles(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-[var(--palm)] bg-[var(--palm)]/10 scale-[1.01]'
                : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--palm)]'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-14 h-14 rounded-3xl bg-[var(--surface-2)] text-[var(--palm)] flex items-center justify-center mx-auto mb-3 shadow-xs">
              <UploadCloud className="w-7 h-7" />
            </div>
            <h3 className="text-[16px] font-extrabold text-[var(--ink)]">
              Drag & Drop Botanical Documents or Click to Browse
            </h3>
            <p className="text-[12.5px] text-[var(--ink-soft)] max-w-md mx-auto mt-1">
              Supports <b>PDF</b> botanical books, <b>CSV / XLS / XLSX</b> database sheets, scientific papers, and <b>DOCX / TXT</b> field surveys.
            </p>
            <div className="flex items-center justify-center gap-2 mt-3 text-[11px] font-mono text-[var(--ink-soft)]">
              <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)]">.PDF</span>
              <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)]">.CSV</span>
              <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)]">.XLSX</span>
              <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)]">.DOCX</span>
              <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)]">.TXT</span>
            </div>
          </div>

          {/* Uploaded Documents List */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-extrabold text-[var(--ink)] flex items-center gap-2">
                  <BookOpen className="w-4.5 h-4.5 text-[var(--palm)]" />
                  Botanical Ingestion Repository ({documents.length} Files)
                </h3>
                <small className="text-[12px] text-[var(--ink-soft)] block">
                  Track 12-stage extraction pipelines, page-by-page progress, and RAG vector indexing status.
                </small>
              </div>
            </div>

            <div className="space-y-2.5">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => {
                    setInspectingDoc(doc);
                    setIsDocModalOpen(true);
                  }}
                  className="p-3.5 bg-[var(--surface)] hover:bg-[var(--surface-2)]/40 border border-[var(--line)] rounded-2xl cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-xl bg-[var(--surface-2)] text-[var(--palm)] flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      {doc.file_type === 'xlsx' || doc.file_type === 'csv' ? (
                        <FileSpreadsheet className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </span>
                    <div>
                      <b className="text-[13.5px] text-[var(--ink)] group-hover:text-[var(--palm)] transition-colors">
                        {doc.original_name}
                      </b>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--ink-soft)] mt-0.5">
                        <span className="font-mono uppercase font-bold">{doc.file_type}</span>
                        <span>·</span>
                        <span>{(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                        <span>·</span>
                        <span>{doc.total_pages || 1} pages</span>
                        <span>·</span>
                        <span>Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {doc.rag_indexed ? (
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-800 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        RAG Indexed ({doc.chunks_count} chunks)
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-800 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {doc.processing_stage.replace(/_/g, ' ')}
                      </span>
                    )}

                    <ChevronRight className="w-4 h-4 text-[var(--ink-soft)] group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 3: BOTANICAL DATABASE MANAGEMENT */}
      {/* ======================================================= */}
      {activeTab === 'database' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Filters Bar */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--ink-soft)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search botanical species, family, scientific synonyms, common names..."
                  value={dbSearch}
                  onChange={(e) => setDbSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:outline-[var(--palm)]"
                />
              </div>

              {/* Add New Record Button */}
              <button
                type="button"
                onClick={() => {
                  setEditingProfile(null);
                  setIsProfileModalOpen(true);
                }}
                className="px-4 py-2 bg-[var(--palm)] text-white text-[12.5px] font-extrabold rounded-xl shadow-xs hover:brightness-105 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Create Plant Record
              </button>
            </div>

            {/* Secondary Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[11.5px] font-bold text-[var(--ink-soft)] no-scrollbar">
              <span className="flex items-center gap-1 shrink-0">
                <Filter className="w-3.5 h-3.5" /> Filters:
              </span>

              {/* Family Dropdown */}
              <select
                value={dbFamilyFilter}
                onChange={(e) => setDbFamilyFilter(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">All Families ({uniqueFamilies.length})</option>
                {uniqueFamilies.map((fam) => (
                  <option key={fam} value={fam}>{fam}</option>
                ))}
              </select>

              {/* Habit Filter */}
              <select
                value={dbHabitFilter}
                onChange={(e) => setDbHabitFilter(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">All Growth Habits</option>
                <option value="tree">Trees</option>
                <option value="palm">Palms</option>
                <option value="shrub">Shrubs</option>
                <option value="epiphyte">Epiphytes</option>
                <option value="herbaceous">Herbaceous</option>
              </select>

              {/* Visibility Filter */}
              <select
                value={dbVisibilityFilter}
                onChange={(e) => setDbVisibilityFilter(e.target.value as any)}
                className="px-2.5 py-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">All Visibility</option>
                <option value="public">Public Records Only</option>
                <option value="private">Private / Internal Only</option>
              </select>

              {/* Salt Filter */}
              <select
                value={dbSaltFilter}
                onChange={(e) => setDbSaltFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-2.5 py-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">All Salt Tolerances</option>
                <option value="1">Grade 1: Sheltered</option>
                <option value="2">Grade 2: Moderate Island Breeze</option>
                <option value="3">Grade 3: Beachfront Spray</option>
              </select>

              {(dbSearch || dbFamilyFilter !== 'all' || dbHabitFilter !== 'all' || dbVisibilityFilter !== 'all' || dbSaltFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setDbSearch('');
                    setDbFamilyFilter('all');
                    setDbHabitFilter('all');
                    setDbVisibilityFilter('all');
                    setDbSaltFilter('all');
                  }}
                  className="text-red-600 hover:underline px-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Plant Profiles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredProfiles.map((profile) => (
              <div
                key={profile.id}
                className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl overflow-hidden shadow-xs hover:border-[var(--palm)] transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Photo Thumbnail */}
                  <div className="relative aspect-16/9 bg-[var(--surface-2)] overflow-hidden">
                    {profile.media[0]?.url ? (
                      <img
                        src={profile.media[0].url}
                        alt={profile.taxonomy.scientific_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--palm)]">
                        <Leaf className="w-10 h-10" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white">
                        {profile.taxonomy.family}
                      </span>
                      {profile.is_verified && (
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                        </span>
                      )}
                    </div>

                    <div className="absolute top-2 right-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1 ${
                          profile.visibility === 'public'
                            ? 'bg-emerald-500/80 text-white'
                            : 'bg-amber-500/80 text-white'
                        }`}
                      >
                        {profile.visibility === 'public' ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                        {profile.visibility}
                      </span>
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-4 space-y-1.5">
                    <h3 className="text-[16px] font-extrabold text-[var(--ink)] leading-snug italic">
                      {profile.taxonomy.scientific_name}
                    </h3>
                    <div className="text-[12.5px] font-bold text-[var(--palm)]">
                      {profile.identification.common_names.es[0] || profile.identification.common_names.en[0] || 'Tropical Specimen'}
                      {profile.identification.common_names.en[0] && profile.identification.common_names.es[0] && (
                        <span className="text-[11.5px] text-[var(--ink-soft)] font-normal italic">
                          {' '}· {profile.identification.common_names.en[0]}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--ink-soft)] line-clamp-2 leading-relaxed">
                      {profile.identification.leaf_characteristics || profile.horticulture.soil_preferences}
                    </p>

                    {/* Regional Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--ink)]">
                        Salt Level {profile.regional.salt_tolerance_level}/3
                      </span>
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--ink)]">
                        {profile.identification.growth_habit}
                      </span>
                      {profile.regional.wind_tolerance === 'high_hurricane_resilient' && (
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700">
                          Hurricane Resilient
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="p-3 border-t border-[var(--line)] bg-[var(--surface-2)]/30 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[var(--ink-soft)]">
                    {profile.sources.length} sources · {profile.linked_catalog_item_ids.length} store items
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProfile(profile);
                        setIsProfileModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line)] text-[12px] font-bold text-[var(--ink)] hover:bg-[var(--surface-2)] flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-[var(--palm)]" />
                      Edit Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete botanical profile for ${profile.taxonomy.scientific_name}?`)) {
                          botanicalKnowledgeService.deleteProfile(profile.id);
                          refreshState();
                          showFeedback('Botanical profile removed.');
                        }
                      }}
                      className="p-1.5 rounded-xl text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 4: TAXONOMY & SYNONYM MANAGEMENT */}
      {/* ======================================================= */}
      {activeTab === 'taxonomy' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* External Kew / GBIF Lookup Engine */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <div>
              <h3 className="text-[15px] font-extrabold text-[var(--ink)] flex items-center gap-2">
                <Globe2 className="w-4.5 h-4.5 text-[var(--palm)]" />
                External Authority Verification & Lookup
              </h3>
              <small className="text-[12px] text-[var(--ink-soft)] block">
                Connect and query taxonomic records from Kew Plants of the World Online (POWO), GBIF, and World Flora Online (WFO).
              </small>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Query scientific name (e.g. Cocos nucifera, Swietenia mahagoni)..."
                value={externalTaxonQuery}
                onChange={(e) => setExternalTaxonQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleExternalLookup();
                }}
                className="flex-1 px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[13px] text-[var(--ink)]"
              />
              <select
                value={externalSource}
                onChange={(e) => setExternalSource(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px] font-bold"
              >
                <option value="kew_powo">Kew Plants of the World Online</option>
                <option value="gbif">GBIF Global Biodiversity</option>
                <option value="world_flora_online">World Flora Online (WFO)</option>
              </select>
              <button
                type="button"
                onClick={handleExternalLookup}
                disabled={externalLoading}
                className="px-4 py-2 bg-[var(--palm)] text-white text-[12.5px] font-extrabold rounded-xl shadow-xs flex items-center justify-center gap-1.5"
              >
                {externalLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Query Authority
              </button>
            </div>

            {externalResult && (
              <div className="p-4 bg-[var(--surface-2)]/50 rounded-2xl border border-[var(--line)] space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-[var(--palm)] text-white">
                    {externalResult.database_source.toUpperCase()}
                  </span>
                  <a
                    href={externalResult.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11.5px] font-bold text-[var(--palm)] flex items-center gap-1 hover:underline"
                  >
                    View on Kew/GBIF <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="text-[14px] font-extrabold italic text-[var(--ink)]">
                  {externalResult.scientific_name}
                </div>
                <p className="text-[12px] text-[var(--ink-soft)] font-mono">
                  Authority ID: {externalResult.external_id} · Status: {externalResult.taxonomic_status}
                </p>
                <p className="text-[12px] text-[var(--ink)]">
                  {externalResult.distribution_summary}
                </p>
              </div>
            )}
          </div>

          {/* Duplicate Detection & Merging Tool */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <div>
              <h3 className="text-[15px] font-extrabold text-[var(--ink)] flex items-center gap-2">
                <GitMerge className="w-4.5 h-4.5 text-amber-600" />
                Duplicate Taxa & Synonym Merging Console ({duplicates.length} Pending)
              </h3>
              <small className="text-[12px] text-[var(--ink-soft)] block">
                Resolve junior synonyms and duplicate records. Merging safely transfers all photos, observations, and citations into the primary accepted record.
              </small>
            </div>

            {duplicates.length === 0 ? (
              <div className="p-6 text-center bg-[var(--surface-2)]/30 rounded-2xl border border-[var(--line)]">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-[13px] font-bold text-[var(--ink)]">No Duplicate Taxa Detected</p>
                <small className="text-[11.5px] text-[var(--ink-soft)]">
                  All scientific names match verified unique accepted species.
                </small>
              </div>
            ) : (
              <div className="space-y-2.5">
                {duplicates.map((dup) => (
                  <div
                    key={dup.id}
                    className="p-3.5 bg-[var(--surface)] border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800">
                          {Math.round(dup.similarity_score * 100)}% Match · {dup.reason.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-[13.5px] font-extrabold text-[var(--ink)] mt-1">
                        <span className="italic text-[var(--palm)]">{dup.primary_name}</span>
                        {' '}&#8594;{' '}
                        <span className="italic text-[var(--ink-soft)]">{dup.secondary_name}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setMergingCandidate(dup);
                        setIsMergeModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 bg-amber-600 text-white text-[12px] font-bold rounded-xl shadow-xs hover:bg-amber-700 flex items-center gap-1.5 self-end sm:self-center"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      Review & Merge
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 5: AI EXTRACTION REVIEW QUEUE */}
      {/* ======================================================= */}
      {activeTab === 'extraction_review' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <div>
              <h3 className="text-[15px] font-extrabold text-[var(--ink)] flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5 text-[var(--palm)]" />
                AI Botanical Extraction Review Queue
              </h3>
              <small className="text-[12px] text-[var(--ink-soft)] block">
                Verify AI-extracted botanical characteristics, dosages, and soil requirements from uploaded books and field manuals.
              </small>
            </div>

            <div className="space-y-3">
              {documents
                .filter((d) => d.extracted_entities.length > 0)
                .map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 bg-[var(--surface-2)]/30 border border-[var(--line)] rounded-2xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <b className="text-[13.5px] text-[var(--ink)]">{doc.original_name}</b>
                        <span className="text-[11.5px] text-[var(--ink-soft)] block">
                          {doc.extracted_entities.length} botanical entities extracted
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setInspectingDoc(doc);
                          setIsDocModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-[var(--palm)] text-white text-[12px] font-bold rounded-xl flex items-center gap-1"
                      >
                        Inspect Full Document <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {doc.extracted_entities.map((entity, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-[var(--surface)] border border-[var(--line)] rounded-xl flex items-center justify-between text-[12px]"
                        >
                          <div>
                            <span className="text-[10px] font-extrabold uppercase text-[var(--ink-soft)] block">
                              {entity.field_name}
                            </span>
                            <b className="text-[12.5px] text-[var(--ink)]">{String(entity.extracted_value)}</b>
                          </div>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                              entity.approval_status === 'approved'
                                ? 'bg-emerald-500/15 text-emerald-800'
                                : 'bg-amber-500/15 text-amber-800'
                            }`}
                          >
                            {entity.approval_status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 6: RAG PLAYGROUND & INDEXING */}
      {/* ======================================================= */}
      {activeTab === 'rag_playground' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Indexing Stats Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase block">Indexed Chunks</span>
              <b className="text-[22px] text-[var(--ink)]">{botanicalKnowledgeService.getRAGStats().total_chunks}</b>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase block">Vector Dimension</span>
              <b className="text-[22px] text-[var(--palm)]">1536-dim</b>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase block">Vector Namespace</span>
              <b className="text-[14px] text-[var(--ink)] font-mono truncate block mt-1">honduras_flora</b>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3.5">
              <span className="text-[11px] font-bold text-[var(--ink-soft)] uppercase block">Engine</span>
              <b className="text-[14px] text-emerald-700 font-bold block mt-1">pgvector + Hybrid</b>
            </div>
          </div>

          {/* Playground Interface */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-[15px] font-extrabold text-[var(--ink)] flex items-center gap-2">
                <Cpu className="w-4.5 h-4.5 text-[var(--palm)]" />
                RAG Retrieval Testing & Context Assembly Playground
              </h3>
              <small className="text-[12px] text-[var(--ink-soft)] block">
                Enter a natural language inquiry to inspect vector similarity, retrieved passages, relevance scores, and assembled context supplied to the AI.
              </small>
            </div>

            {/* Knobs & Configuration */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--surface-2)]/40 p-3.5 rounded-2xl border border-[var(--line)] text-[12px]">
              <div>
                <label className="font-bold text-[var(--ink)] block mb-1">Search Method</label>
                <select
                  value={ragConfig.search_method}
                  onChange={(e) => setRagConfig((prev) => ({ ...prev, search_method: e.target.value as any }))}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] font-bold text-[var(--ink)]"
                >
                  <option value="hybrid">Hybrid (Keyword + Vector)</option>
                  <option value="semantic">Semantic (Cosine Vector Only)</option>
                  <option value="keyword">Keyword Exact Match</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[var(--ink)] block mb-1">
                  Similarity Threshold: {ragConfig.similarity_threshold}
                </label>
                <input
                  type="range"
                  min="0.4"
                  max="0.95"
                  step="0.05"
                  value={ragConfig.similarity_threshold}
                  onChange={(e) => setRagConfig((prev) => ({ ...prev, similarity_threshold: Number(e.target.value) }))}
                  className="w-full accent-[var(--palm)]"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--ink)] block mb-1">Max Retrieved Chunks</label>
                <select
                  value={ragConfig.max_retrieved_results}
                  onChange={(e) => setRagConfig((prev) => ({ ...prev, max_retrieved_results: Number(e.target.value) }))}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] font-bold text-[var(--ink)]"
                >
                  <option value={3}>Top 3 Chunks</option>
                  <option value={5}>Top 5 Chunks</option>
                  <option value={8}>Top 8 Chunks</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[var(--ink)] block mb-1">Regional Scope</label>
                <select
                  value={ragConfig.regional_scope}
                  onChange={(e) => setRagConfig((prev) => ({ ...prev, regional_scope: e.target.value as any }))}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] font-bold text-[var(--ink)]"
                >
                  <option value="roatan">Roatán & Bay Islands</option>
                  <option value="honduras">All Honduras</option>
                  <option value="caribbean">Wider Caribbean</option>
                </select>
              </div>
            </div>

            {/* Query Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask RAG botanical retrieval test query..."
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleExecuteRAGPlayground();
                }}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[13px] text-[var(--ink)]"
              />
              <button
                type="button"
                onClick={handleExecuteRAGPlayground}
                disabled={ragLoading}
                className="px-5 py-2.5 bg-[var(--palm)] text-white text-[13px] font-extrabold rounded-2xl shadow-xs hover:brightness-105 flex items-center gap-2"
              >
                {ragLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run Retrieval
              </button>
            </div>

            {/* Results Inspection */}
            {ragResult && (
              <div className="space-y-4 pt-2 border-t border-[var(--line)] animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-bold text-[var(--ink)]">
                    Execution Time: <b>{ragResult.execution_time_ms} ms</b> · Retrieved <b>{ragResult.retrieved_passages.length} passages</b>
                  </span>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-600 text-white">
                    {ragResult.accuracy_classification.toUpperCase()}
                  </span>
                </div>

                {/* Retrieved Passages Cards */}
                <div className="space-y-2">
                  <b className="text-[12.5px] text-[var(--ink)] block">Retrieved Document Passages & Similarity Scores:</b>
                  {ragResult.retrieved_passages.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[var(--surface-2)]/30 rounded-2xl border border-[var(--line)] space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[var(--palm)]">
                          [Score: {p.relevance_score}] · {p.source_title}
                        </span>
                        <span className="font-mono text-[var(--ink-soft)]">
                          {p.retrieval_method_used}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">
                        {p.snippet}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Assembled Context */}
                <div className="bg-[var(--surface-2)]/40 p-3.5 rounded-2xl border border-[var(--line)] space-y-1">
                  <b className="text-[11.5px] font-bold text-[var(--ink)] block">
                    Final Assembled Context Supplied to AI Prompt:
                  </b>
                  <pre className="text-[11px] font-mono text-[var(--ink-soft)] whitespace-pre-wrap max-h-36 overflow-y-auto bg-[var(--surface)] p-2.5 rounded-xl border border-[var(--line)]">
                    {ragResult.assembled_context}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 7: REGIONAL BOTANICAL INTELLIGENCE */}
      {/* ======================================================= */}
      {activeTab === 'regional' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-[15px] font-extrabold text-[var(--ink)] flex items-center gap-2">
                <MapPin className="w-4.5 h-4.5 text-[var(--palm)]" />
                Bay Islands & Honduras Regional Botanical Intelligence
              </h3>
              <small className="text-[12px] text-[var(--ink-soft)] block">
                Filter species specifically proven for Roatán's microclimate (coralline limestone pH, dry-season drought, salt breeze, hurricane gusts).
              </small>
            </div>

            {/* Quick Regional Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRegCoastalFilter(!regCoastalFilter)}
                className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all flex items-center gap-1.5 ${
                  regCoastalFilter
                    ? 'bg-[var(--palm)] text-white border-[var(--palm)]'
                    : 'bg-[var(--surface)] text-[var(--ink-soft)] border-[var(--line)]'
                }`}
              >
                <Compass className="w-3.5 h-3.5" /> Coastal Suitable
              </button>

              <button
                type="button"
                onClick={() => setRegHurricaneFilter(!regHurricaneFilter)}
                className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border transition-all flex items-center gap-1.5 ${
                  regHurricaneFilter
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-[var(--surface)] text-[var(--ink-soft)] border-[var(--line)]'
                }`}
              >
                <Wind className="w-3.5 h-3.5" /> Hurricane Resilient
              </button>

              <select
                value={regSaltLevelFilter}
                onChange={(e) => setRegSaltLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-3 py-1.5 rounded-xl text-[12px] font-bold border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">Any Salt Spray</option>
                <option value="3">Grade 3: Beachfront Spray (High)</option>
                <option value="2">Grade 2: Windward Breeze</option>
                <option value="1">Grade 1: Sheltered</option>
              </select>

              <select
                value={regOriginFilter}
                onChange={(e) => setRegOriginFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl text-[12px] font-bold border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">All Origins</option>
                <option value="native">Native to Honduras / Bay Islands</option>
                <option value="invasive">High Risk / Potentially Invasive</option>
              </select>
            </div>

            {/* Matching Species */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {regionalFilteredProfiles.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 bg-[var(--surface-2)]/30 rounded-2xl border border-[var(--line)] flex items-start gap-3"
                >
                  <img
                    src={p.media[0]?.url || 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=400'}
                    alt={p.taxonomy.scientific_name}
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <b className="text-[13px] font-bold text-[var(--ink)] italic block truncate">
                      {p.taxonomy.scientific_name}
                    </b>
                    <span className="text-[12px] text-[var(--palm)] font-bold block truncate">
                      {p.identification.common_names.es[0] || p.identification.common_names.en[0]}
                    </span>
                    <span className="text-[11px] text-[var(--ink-soft)] block truncate mt-0.5">
                      Salt: Grade {p.regional.salt_tolerance_level}/3 · {p.regional.native_distribution}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* TAB 8: AI BOTANICAL ASSISTANT */}
      {/* ======================================================= */}
      {activeTab === 'assistant' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col h-[600px] overflow-hidden">
            {/* Assistant Header */}
            <div className="pb-3 border-b border-[var(--line)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-[var(--palm)] text-white flex items-center justify-center shadow-xs">
                  <Compass className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h3 className="text-[14.5px] font-extrabold text-[var(--ink)]">
                    Verde Botanical AI Assistant
                  </h3>
                  <small className="text-[11.5px] text-[var(--ink-soft)]">
                    Connected to RAG knowledge vector store · Strict accuracy protocol
                  </small>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-4">
              {chatMessages.map((msg) => {
                const isAssistant = msg.sender === 'assistant';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[88%] sm:max-w-[80%] rounded-2xl p-3.5 sm:p-4 text-[13px] shadow-xs ${
                        isAssistant
                          ? 'bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line)]'
                          : 'bg-[var(--palm)] text-white font-semibold'
                      }`}
                    >
                      {/* Accuracy Badge */}
                      {isAssistant && msg.accuracy_badge && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            {msg.accuracy_badge.replace(/_/g, ' ')}
                          </span>
                        </div>
                      )}

                      <div className="whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>

                      {/* Referenced Botanical Species */}
                      {msg.referenced_botanical_profiles && msg.referenced_botanical_profiles.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-[var(--line)]/50 flex flex-wrap gap-2">
                          {msg.referenced_botanical_profiles.map((p) => (
                            <div
                              key={p.id}
                              className="p-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line)] flex items-center gap-2"
                            >
                              {p.thumbnail && (
                                <img src={p.thumbnail} alt={p.scientific_name} className="w-7 h-7 rounded-lg object-cover" />
                              )}
                              <span className="text-[11.5px] font-bold text-[var(--palm)] italic">
                                {p.scientific_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Citations */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-2 text-[10.5px] text-[var(--ink-soft)] font-mono">
                          Sources: {msg.citations.map((c) => `${c.source_title} (${c.author})`).join(', ')}
                        </div>
                      )}
                    </div>

                    {/* Suggested follow-up queries */}
                    {isAssistant && msg.suggested_follow_ups && (
                      <div className="flex flex-wrap gap-1.5 mt-2 max-w-[85%]">
                        {msg.suggested_follow_ups.map((followUp, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendChatMessage(followUp)}
                            className="text-[11px] font-bold text-[var(--palm)] bg-[var(--surface-2)] hover:bg-[var(--surface)] border border-[var(--line)] px-2.5 py-1 rounded-full transition-all text-left"
                          >
                            &#10140; {followUp}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {chatLoading && (
                <div className="p-3 bg-[var(--surface-2)] rounded-2xl w-fit flex items-center gap-2 text-[12px] text-[var(--ink-soft)]">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--palm)]" />
                  Retrieving verified botanical records...
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="pt-3 border-t border-[var(--line)] flex items-center gap-2">
              <input
                type="text"
                placeholder="Ask about taxonomy, soil, watering, or pests..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[13px] text-[var(--ink)] focus:outline-[var(--palm)]"
              />
              <button
                type="button"
                onClick={() => handleSendChatMessage()}
                disabled={chatLoading}
                className="p-2.5 rounded-2xl bg-[var(--palm)] text-white hover:brightness-105 shadow-xs"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* MODALS */}
      {/* ======================================================= */}
      <BotanicalProfileEditorModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profile={editingProfile}
        catalogItems={catalogItems}
        onSave={(updated) => {
          botanicalKnowledgeService.saveProfile(updated);
          refreshState();
          showFeedback('Botanical profile saved.');
        }}
        lang={lang}
      />

      <DocumentDetailModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        document={inspectingDoc}
        onApproveForRAG={(docId) => {
          botanicalKnowledgeService.approveDocumentForRAG(docId);
          refreshState();
          showFeedback('Document approved and indexed into RAG vector store!');
        }}
        onReprocess={(docId) => {
          botanicalKnowledgeService.reprocessDocument(docId);
          refreshState();
          showFeedback('Document pipeline re-initiated.');
        }}
        onDelete={(docId) => {
          botanicalKnowledgeService.deleteDocument(docId);
          refreshState();
          showFeedback('Document removed.');
        }}
        onUpdateEntityStatus={(docId, fieldName, status, val) => {
          botanicalKnowledgeService.updateExtractedEntityStatus(docId, fieldName, status, val);
          refreshState();
          showFeedback(`Field ${fieldName} updated to ${status}.`);
        }}
        lang={lang}
      />

      <DuplicateMergerModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        candidate={mergingCandidate}
        onConfirmMerge={(pId, sId) => {
          botanicalKnowledgeService.mergeDuplicateRecords(pId, sId, 'Verde Lead Taxonomist');
          refreshState();
          showFeedback('Records safely merged. All photos & citations preserved.');
        }}
        lang={lang}
      />
    </div>
  );
};
