import React, { useState } from 'react';
import { Clock, Edit2, MapPin, Plus, Star, Trash2, Wrench } from 'lucide-react';
import { Landscaper, Language } from '../types';
import { STRINGS } from '../data/initialData';

interface ServicesScreenProps {
  lang: Language;
  landscapers: Landscaper[];
  onRequestQuote: (crew: Landscaper) => void;
  isAdmin?: boolean;
  onAddLandscaper?: () => void;
  onEditLandscaper?: (crew: Landscaper) => void;
  onDeleteLandscaper?: (crew: Landscaper) => void;
}

export const ServicesScreen: React.FC<ServicesScreenProps> = ({
  lang,
  landscapers,
  onRequestQuote,
  isAdmin = false,
  onAddLandscaper,
  onEditLandscaper,
  onDeleteLandscaper
}) => {
  const [filter, setFilter] = useState<string>('All');
  const t = (k: string) => STRINGS[lang]?.[k] || STRINGS.en[k] || k;

  const categories = ['All', 'Design', 'Planting', 'Maintenance', 'Pest treatment', 'Irrigation'];

  const filtered = landscapers.filter(
    (crew) => filter === 'All' || crew.svc.includes(filter)
  );

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Header */}
      <header className="flex items-center justify-between px-1">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[24px] font-extrabold text-[var(--ink)] tracking-tight">
            {t('services')}
          </h1>
          <p className="text-[12.5px] text-[var(--ink-soft)]">
            {lang === 'es'
              ? 'Jardineros y cuadrillas de confianza en Roatán.'
              : 'Trusted Roatán landscapers and groundskeepers.'}
          </p>
        </div>

        {/* Admin Add Button */}
        {isAdmin && (
          <button
            type="button"
            onClick={onAddLandscaper}
            className="inline-flex items-center gap-1 text-[12px] font-extrabold px-3 py-1.5 rounded-xl bg-[var(--palm)] text-white hover:opacity-90 active:scale-95 shadow-xs transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> + Crew
          </button>
        )}
      </header>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
        {categories.map((cat) => {
          const isSelected = filter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              aria-pressed={isSelected}
              className={`flex-none px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold border transition-all active:scale-95 ${
                isSelected
                  ? 'bg-[var(--palm)] border-[var(--palm)] text-[var(--on-palm)] shadow-xs'
                  : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--palm)]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Landscapers List */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-6 text-center text-[var(--ink-soft)] flex flex-col items-center gap-2">
            <Wrench className="w-8 h-8 opacity-40" />
            <p className="text-[13.5px]">No landscapers match this category filter.</p>
            {isAdmin && (
              <button
                type="button"
                onClick={onAddLandscaper}
                className="mt-1 text-[12px] font-bold text-white bg-[var(--palm)] px-3.5 py-1.5 rounded-xl shadow-xs"
              >
                + Register New Landscaper
              </button>
            )}
          </div>
        ) : (
          filtered.map((crew) => (
            <div
              key={crew.id}
              className="flex flex-col gap-3 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 shadow-xs"
            >
              {/* Top Info */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-full bg-[var(--palm)] text-[var(--on-palm)] font-display font-extrabold text-[16px] flex items-center justify-center shrink-0">
                    {crew.ini}
                  </span>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <b className="text-[16px] text-[var(--ink)] font-bold">{crew.name}</b>
                      <span className="inline-flex items-center text-[12.5px] font-extrabold text-[var(--sun)]">
                        <Star className="w-3.5 h-3.5 fill-current mr-0.5" />
                        {crew.rate}
                      </span>
                    </div>
                    <span className="text-[12px] text-[var(--ink-soft)] flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-[var(--lagoon)] shrink-0" />
                      {crew.areas}
                    </span>
                  </div>
                </div>

                {/* Admin Direct Actions on Card */}
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditLandscaper?.(crew)}
                      title="Edit landscaper parameters"
                      className="p-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--palm)] hover:text-white text-[var(--ink)] transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLandscaper?.(crew)}
                      title="Delete landscaper from database"
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-600 hover:text-white text-red-600 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Service Tags */}
              <div className="flex flex-wrap gap-1.5">
                {crew.svc.map((s, idx) => (
                  <span
                    key={idx}
                    className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)]"
                  >
                    {s}
                  </span>
                ))}
              </div>

              {/* Bottom response & Quote action */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
                <span className="text-[11.5px] text-[var(--lagoon)] font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  {crew.reply}
                </span>
                <button
                  type="button"
                  onClick={() => onRequestQuote(crew)}
                  className="bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-bold text-[13px] px-4 py-2 rounded-xl shadow-xs active:scale-95 transition-all"
                >
                  {t('quoteTitle')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
