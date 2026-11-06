import React, { useState } from 'react';
import { BotanicalDocument } from '../../types/botanicalKnowledge';
import { Language } from '../../types';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Edit2,
  FileCheck,
  FileText,
  Layers,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';

interface DocumentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: BotanicalDocument | null;
  onApproveForRAG: (docId: string) => void;
  onReprocess: (docId: string) => void;
  onDelete: (docId: string) => void;
  onUpdateEntityStatus: (
    docId: string,
    fieldName: string,
    status: 'approved' | 'rejected' | 'modified',
    editedValue?: any
  ) => void;
  lang: Language;
}

const STAGE_LABELS: Record<string, { en: string; es: string }> = {
  uploaded: { en: '1. Uploaded', es: '1. Subido' },
  validating: { en: '2. Validating Format', es: '2. Validando formato' },
  extracting_text: { en: '3. Extracting Text (OCR)', es: '3. Extrayendo texto' },
  parsing_botanical_info: { en: '4. Parsing Botanical Data', es: '4. Procesando datos botánicos' },
  identifying_scientific_names: { en: '5. Identifying Scientific Names', es: '5. Identificando nombres científicos' },
  extracting_botanical_characteristics: { en: '6. Extracting Morphology', es: '6. Extrayendo morfología' },
  extracting_horticultural_recommendations: { en: '7. Extracting Horticulture', es: '7. Extrayendo horticultura' },
  extracting_references_sources: { en: '8. Extracting Sources', es: '8. Extrayendo fuentes' },
  awaiting_review: { en: '9. Awaiting Admin Review', es: '9. En espera de revisión' },
  approved: { en: '10. Approved', es: '10. Aprobado' },
  indexed_in_rag: { en: '11. Indexed in RAG Vector Store', es: '11. Indexado en RAG' },
  available_for_ai_retrieval: { en: '12. Available for AI Retrieval', es: '12. Disponible para IA' },
  failed: { en: 'Failed Processing', es: 'Procesamiento fallido' },
  reprocessing: { en: 'Reprocessing Pipeline', es: 'Reprocesando tubería' },
  cancelled: { en: 'Cancelled', es: 'Cancelado' }
};

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  isOpen,
  onClose,
  document,
  onApproveForRAG,
  onReprocess,
  onDelete,
  onUpdateEntityStatus,
  lang
}) => {
  if (!isOpen || !document) return null;

  const [activeTab, setActiveTab] = useState<'entities' | 'text' | 'pipeline' | 'metadata'>('entities');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const stageLabel = STAGE_LABELS[document.processing_stage]?.[lang] || document.processing_stage;

  const handleStartEdit = (fieldName: string, currentVal: any) => {
    setEditingField(fieldName);
    setEditValue(typeof currentVal === 'object' ? JSON.stringify(currentVal) : String(currentVal));
  };

  const handleSaveEdit = (fieldName: string) => {
    onUpdateEntityStatus(document.id, fieldName, 'modified', editValue);
    setEditingField(null);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-2 sm:p-5 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] overflow-y-auto overflow-x-hidden">
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl w-full min-w-0 max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-3 sm:p-5 border-b border-[var(--line)] bg-[var(--surface-2)]/60 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-10 h-10 rounded-2xl bg-[var(--palm)] text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-extrabold text-[var(--ink)] leading-tight flex items-center gap-2">
                {document.original_name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 min-w-0">
                <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--ink-soft)] font-mono">
                  {document.file_type.toUpperCase()} · {(document.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                </span>
                <span className="text-[11px] font-bold text-[var(--palm)] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {stageLabel}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & Action Bar */}
        <div className="p-3 sm:p-4 bg-[var(--surface)] border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3">
          {/* Progress bar */}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-[11px] font-bold text-[var(--ink-soft)] mb-1">
              <span>Ingestion Pipeline Progress</span>
              <span>{document.stage_progress_pct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--palm)] rounded-full transition-all duration-500"
                style={{ width: `${document.stage_progress_pct}%` }}
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            {!document.rag_indexed && (
              <button
                type="button"
                onClick={() => onApproveForRAG(document.id)}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--palm)] text-white text-[12px] font-extrabold flex items-center gap-1.5 shadow-xs hover:brightness-105"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve & Index in RAG
              </button>
            )}

            <button
              type="button"
              onClick={() => onReprocess(document.id)}
              className="p-2 rounded-xl border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
              title="Reprocess Document"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (confirm('Delete document and remove its chunks from the RAG index?')) {
                  onDelete(document.id);
                  onClose();
                }
              }}
              className="p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
              title="Delete Document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center gap-1 px-2 sm:px-4 pt-2 pb-1 border-b border-[var(--line)] bg-[var(--surface)] overflow-x-auto overflow-y-hidden shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('entities')}
            className={`py-1.5 px-3 rounded-xl text-[12px] font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'entities'
                ? 'bg-[var(--palm)] text-white shadow-xs'
                : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Extracted Entities ({document.extracted_entities.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`py-1.5 px-3 rounded-xl text-[12px] font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'text'
                ? 'bg-[var(--palm)] text-white shadow-xs'
                : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Document Text ({document.chunks_count} Chunks)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`py-1.5 px-3 rounded-xl text-[12px] font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'pipeline'
                ? 'bg-[var(--palm)] text-white shadow-xs'
                : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            12-Stage Pipeline
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
          {/* TAB 1: EXTRACTED ENTITIES */}
          {activeTab === 'entities' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
                <div>
                  <b className="text-[14px] text-[var(--ink)] font-bold">
                    AI-Identified Botanical Properties
                  </b>
                  <small className="text-[12px] text-[var(--ink-soft)] block">
                    Review and verify extracted fields before committing to the canonical botanical database.
                  </small>
                </div>
                <span className="text-[11px] font-bold text-[var(--palm)]">
                  {document.extracted_taxa.join(', ') || 'No taxa tagged'}
                </span>
              </div>

              {document.extracted_entities.length === 0 ? (
                <div className="p-8 text-center bg-[var(--surface-2)]/40 rounded-2xl border border-[var(--line)]">
                  <p className="text-[13px] text-[var(--ink-soft)]">
                    No individual entities extracted yet. Processing pipeline is ongoing.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {document.extracted_entities.map((entity, idx) => {
                    const isEditing = editingField === entity.field_name;
                    return (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          entity.approval_status === 'approved'
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : entity.approval_status === 'rejected'
                            ? 'bg-red-500/5 border-red-500/20 opacity-75'
                            : 'bg-[var(--surface)] border-[var(--line)]'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--ink-soft)]">
                                {entity.category}
                              </span>
                              <b className="text-[13px] font-bold text-[var(--ink)]">
                                {entity.field_name}
                              </b>
                              <span className="text-[11px] text-[var(--ink-soft)] font-mono">
                                (Confidence: {Math.round(entity.confidence * 100)}%)
                              </span>
                              {entity.source_page && (
                                <span className="text-[10.5px] text-[var(--ink-soft)]">
                                  Page {entity.source_page}
                                </span>
                              )}
                            </div>

                            {/* Extracted Value */}
                            {isEditing ? (
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="flex-1 px-3 py-1 rounded-xl border border-[var(--palm)] bg-[var(--surface)] text-[12.5px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(entity.field_name)}
                                  className="px-3 py-1 bg-[var(--palm)] text-white text-[11px] font-bold rounded-xl"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingField(null)}
                                  className="px-2 py-1 text-[11px] text-[var(--ink-soft)]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="text-[13px] font-bold text-[var(--palm)] mt-0.5">
                                {entity.edited_value !== undefined
                                  ? String(entity.edited_value)
                                  : String(entity.extracted_value)}
                              </div>
                            )}

                            {/* Source Snippet */}
                            {entity.source_snippet && (
                              <p className="text-[11.5px] text-[var(--ink-soft)] italic mt-1 bg-[var(--surface-2)]/40 p-2 rounded-xl">
                                "{entity.source_snippet}"
                              </p>
                            )}
                          </div>

                          {/* Approval Controls */}
                          <div className="flex items-center justify-end gap-1.5 shrink-0 self-end sm:self-start max-w-full">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateEntityStatus(document.id, entity.field_name, 'approved')
                              }
                              className={`p-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
                                entity.approval_status === 'approved'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                              }`}
                              title="Approve Field"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStartEdit(entity.field_name, entity.extracted_value)}
                              className="p-1.5 rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
                              title="Edit Field"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                onUpdateEntityStatus(document.id, entity.field_name, 'rejected')
                              }
                              className={`p-1.5 rounded-lg border text-[11px] font-bold ${
                                entity.approval_status === 'rejected'
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'text-red-600 hover:bg-red-50 border-red-200'
                              }`}
                              title="Reject Field"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DOCUMENT RAW TEXT & CHUNKS */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <div className="bg-[var(--surface-2)]/40 p-4 rounded-2xl border border-[var(--line)] space-y-2">
                <b className="text-[13px] font-bold text-[var(--ink)]">
                  Extracted Document Text Preview
                </b>
                <p className="text-[12.5px] text-[var(--ink)] leading-relaxed font-serif whitespace-pre-wrap">
                  {document.raw_text_preview || 'No raw text stream extracted.'}
                </p>
              </div>

              <div className="p-3 bg-[var(--surface-2)]/20 rounded-xl border border-[var(--line)] flex items-center justify-between text-[12px] text-[var(--ink-soft)]">
                <span>RAG Vector Chunks: <b>{document.chunks_count} segments</b></span>
                <span>Total Document Pages: <b>{document.total_pages || 1} pages</b></span>
              </div>
            </div>
          )}

          {/* TAB 3: 12-STAGE PIPELINE VISUALIZER */}
          {activeTab === 'pipeline' && (
            <div className="space-y-2">
              <b className="text-[13px] font-bold text-[var(--ink)] block mb-3">
                Botanical Document Ingestion Protocol Stages
              </b>
              <div className="space-y-2">
                {Object.entries(STAGE_LABELS)
                  .filter(([k]) => !['failed', 'reprocessing', 'cancelled'].includes(k))
                  .map(([key, label], i) => {
                    const isCurrent = document.processing_stage === key;
                    const isPassed = document.stage_progress_pct >= Math.round(((i + 1) / 12) * 100);
                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                          isCurrent
                            ? 'bg-[var(--palm)]/15 border-[var(--palm)] text-[var(--palm)] font-extrabold'
                            : isPassed
                            ? 'bg-emerald-500/5 border-emerald-500/20 text-[var(--ink)]'
                            : 'bg-[var(--surface-2)]/30 border-[var(--line)] text-[var(--ink-soft)] opacity-60'
                        }`}
                      >
                        <span className="text-[12.5px] font-bold">{label.en}</span>
                        {isPassed && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {isCurrent && (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[var(--palm)] text-white">
                            Active Stage
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
