import React from 'react';
import { DuplicateTaxonCandidate } from '../../types/botanicalKnowledge';
import { Language } from '../../types';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flower2,
  GitMerge,
  Layers,
  Leaf,
  ShieldAlert,
  Sparkles,
  X
} from 'lucide-react';

interface DuplicateMergerModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: DuplicateTaxonCandidate | null;
  onConfirmMerge: (primaryId: string, secondaryId: string) => void;
  lang: Language;
}

export const DuplicateMergerModal: React.FC<DuplicateMergerModalProps> = ({
  isOpen,
  onClose,
  candidate,
  onConfirmMerge,
  lang
}) => {
  if (!isOpen || !candidate) return null;

  const { primary_record, secondary_record } = candidate;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] overflow-y-auto">
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--line)] bg-[var(--surface-2)]/60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
              <GitMerge className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-extrabold text-[var(--ink)] leading-tight flex items-center gap-2">
                Duplicate Taxon Resolution & Merge
              </h2>
              <small className="text-[12px] text-[var(--ink-soft)]">
                Absorb duplicate or synonymous records without losing photographs, observations, or source citations.
              </small>
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

        {/* Warning Banner */}
        <div className="p-3.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-3 text-amber-900 text-[12.5px]">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <b>Similarity Match ({Math.round(candidate.similarity_score * 100)}%):</b> The system detected a potential duplicate between authoritative accepted taxon and junior synonym. Merging will combine all photos, observation history, and citations into the primary record.
          </span>
        </div>

        {/* Side-by-side comparison */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Primary Record (Target to keep) */}
          <div className="bg-[var(--surface-2)]/30 rounded-2xl border-2 border-[var(--palm)] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[var(--palm)] text-white">
                PRIMARY (RETAIN AS ACCEPTED)
              </span>
              <span className="text-[11px] font-mono text-[var(--ink-soft)]">
                ID: {primary_record.id}
              </span>
            </div>

            <div>
              <h3 className="text-[16px] font-extrabold text-[var(--ink)] italic">
                {primary_record.taxonomy.scientific_name}
              </h3>
              <p className="text-[12px] text-[var(--ink-soft)] font-mono">
                {primary_record.taxonomy.author_citation || 'No citation'}
              </p>
              <span className="text-[12px] font-bold text-[var(--palm)]">
                Family: {primary_record.taxonomy.family}
              </span>
            </div>

            <div className="space-y-1.5 text-[12.5px] border-t border-[var(--line)] pt-2">
              <div>
                <b>Common Names:</b> {primary_record.identification.common_names.en.join(', ') || 'None'}
              </div>
              <div>
                <b>Habit:</b> {primary_record.identification.growth_habit}
              </div>
              <div>
                <b>Photographs:</b> {primary_record.media.length} attached
              </div>
              <div>
                <b>Citations:</b> {primary_record.sources.length} sources
              </div>
            </div>
          </div>

          {/* Secondary Record (To absorb & archive) */}
          <div className="bg-[var(--surface-2)]/30 rounded-2xl border-2 border-dashed border-[var(--line)] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)]">
                SECONDARY (TO ABSORB AS SYNONYM)
              </span>
              <span className="text-[11px] font-mono text-[var(--ink-soft)]">
                ID: {secondary_record.id}
              </span>
            </div>

            <div>
              <h3 className="text-[16px] font-extrabold text-[var(--ink)] italic">
                {secondary_record.taxonomy.scientific_name}
              </h3>
              <p className="text-[12px] text-[var(--ink-soft)] font-mono">
                {secondary_record.taxonomy.author_citation || 'No citation'}
              </p>
              <span className="text-[12px] font-bold text-[var(--ink-soft)]">
                Family: {secondary_record.taxonomy.family}
              </span>
            </div>

            <div className="space-y-1.5 text-[12.5px] border-t border-[var(--line)] pt-2">
              <div>
                <b>Common Names:</b> {secondary_record.identification.common_names.en.join(', ') || 'None'}
              </div>
              <div>
                <b>Habit:</b> {secondary_record.identification.growth_habit}
              </div>
              <div>
                <b>Photographs:</b> {secondary_record.media.length} attached
              </div>
              <div>
                <b>Citations:</b> {secondary_record.sources.length} sources
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[var(--line)] bg-[var(--surface)] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12.5px] font-bold text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => {
              onConfirmMerge(candidate.primary_id, candidate.secondary_id);
              onClose();
            }}
            className="px-5 py-2.5 rounded-xl bg-[var(--palm)] text-white text-[12.5px] font-extrabold shadow-sm hover:brightness-105 flex items-center gap-1.5"
          >
            <GitMerge className="w-4 h-4" />
            Safely Merge & Absorb Record
          </button>
        </div>
      </div>
    </div>
  );
};
