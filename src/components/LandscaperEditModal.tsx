import React, { useState } from 'react';
import { Plus, Star, X } from 'lucide-react';
import { Landscaper, Language } from '../types';

interface LandscaperEditModalProps {
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
  onSave: (landscaper: Landscaper) => void;
  initialLandscaper?: Landscaper | null;
}

const DEFAULT_SERVICES = [
  'Design',
  'Planting',
  'Maintenance',
  'Pest treatment',
  'Irrigation',
  'Lawn care',
  'Tree trimming',
  'Hardscaping'
];

export const LandscaperEditModal: React.FC<LandscaperEditModalProps> = ({
  lang,
  isOpen,
  onClose,
  onSave,
  initialLandscaper
}) => {
  const isEditing = Boolean(initialLandscaper);

  const [name, setName] = useState(initialLandscaper?.name || '');
  const [ini, setIni] = useState(initialLandscaper?.ini || '');
  const [areas, setAreas] = useState(initialLandscaper?.areas || 'West End to Sandy Bay');
  const [rate, setRate] = useState(initialLandscaper?.rate || '4.9');
  const [jobs, setJobs] = useState<number>(initialLandscaper?.jobs ?? 25);
  const [reply, setReply] = useState(initialLandscaper?.reply || 'Replies in about an hour');
  const [selectedServices, setSelectedServices] = useState<string[]>(
    initialLandscaper?.svc || ['Design', 'Planting', 'Maintenance']
  );
  const [customService, setCustomService] = useState('');

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    if (!ini || ini.length <= 2) {
      const words = val.trim().split(/\s+/);
      if (words.length >= 2) {
        setIni((words[0][0] + words[1][0]).toUpperCase());
      } else if (words[0]?.length >= 2) {
        setIni(words[0].slice(0, 2).toUpperCase());
      }
    }
  };

  const toggleService = (svc: string) => {
    setSelectedServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    );
  };

  const addCustomService = () => {
    if (customService.trim() && !selectedServices.includes(customService.trim())) {
      setSelectedServices((prev) => [...prev, customService.trim()]);
      setCustomService('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const initials = (ini.trim() || name.slice(0, 2)).toUpperCase();
    const landscaperRecord: Landscaper = {
      id: initialLandscaper?.id || `l-${Date.now()}`,
      name: name.trim(),
      ini: initials,
      areas: areas.trim(),
      rate: rate.trim(),
      jobs: Number(jobs) || 0,
      reply: reply.trim(),
      svc: selectedServices.length > 0 ? selectedServices : ['Maintenance']
    };

    onSave(landscaperRecord);
    onClose();
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-0 right-0 bottom-0 mx-auto max-w-[440px] max-h-[92dvh] overflow-y-auto z-50 bg-[var(--surface)] text-[var(--ink)] rounded-t-3xl border border-[var(--line)] border-b-0 px-4 pt-3 pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))] shadow-2xl animate-in slide-in-from-bottom duration-200"
      >
        <div className="w-10 h-1.5 rounded-full bg-[var(--line)] mx-auto mb-3" />

        <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
          <div>
            <h2 className="text-[19px] font-extrabold text-[var(--ink)]">
              {isEditing ? 'Edit Landscaping Crew' : 'Add New Island Landscaper'}
            </h2>
            <small className="text-[11.5px] text-[var(--ink-soft)]">
              {isEditing ? `Modifying profile for ${initialLandscaper?.name}` : 'Register a trusted Roatán groundskeeper'}
            </small>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)] hover:text-[var(--ink)] flex items-center justify-center font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 mt-3">
          {/* Avatar Preview & Name */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[var(--palm)] text-white font-display font-extrabold text-[18px] flex items-center justify-center shrink-0">
              {ini || 'CR'}
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Company / Crew Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Reef Breeze Landscaping"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--lagoon)]"
              />
            </div>
            <div className="w-20 flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Initials</label>
              <input
                type="text"
                maxLength={3}
                value={ini}
                onChange={(e) => setIni(e.target.value.toUpperCase())}
                placeholder="RB"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] text-center font-bold uppercase focus:outline-none focus:border-[var(--lagoon)]"
              />
            </div>
          </div>

          {/* Operating Area */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[var(--ink)]">Island Operating Areas *</label>
            <input
              type="text"
              required
              value={areas}
              onChange={(e) => setAreas(e.target.value)}
              placeholder="e.g. West Bay, Sandy Bay, French Harbour"
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--lagoon)]"
            />
          </div>

          {/* Rating, Jobs, Response Time */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)] flex items-center gap-1">
                <Star className="w-3 h-3 text-[var(--sun)] fill-current" /> Rating
              </label>
              <input
                type="text"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="4.9"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px] font-bold"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)]">Jobs Done</label>
              <input
                type="number"
                min="0"
                value={jobs}
                onChange={(e) => setJobs(Number(e.target.value))}
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-bold text-[var(--ink)] truncate">Response Time</label>
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Replies in ~1 hr"
                className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2 py-2 text-[12px]"
              />
            </div>
          </div>

          {/* Services Offered */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-bold text-[var(--ink)]">
              Services Offered ({selectedServices.length} selected)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto no-scrollbar bg-[var(--surface-2)] p-2 rounded-2xl">
              {DEFAULT_SERVICES.map((s) => {
                const isSelected = selectedServices.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className={`text-[12px] font-bold px-3 py-1 rounded-full border transition-all ${
                      isSelected
                        ? 'bg-[var(--palm)] border-[var(--palm)] text-white'
                        : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--palm)]'
                    }`}
                  >
                    {isSelected ? `✓ ${s}` : `+ ${s}`}
                  </button>
                );
              })}
              {selectedServices
                .filter((s) => !DEFAULT_SERVICES.includes(s))
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className="text-[12px] font-bold px-3 py-1 rounded-full bg-[var(--palm)] text-white flex items-center gap-1"
                  >
                    ✓ {s} <X className="w-3 h-3" />
                  </button>
                ))}
            </div>

            {/* Custom service add */}
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="text"
                value={customService}
                onChange={(e) => setCustomService(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomService();
                  }
                }}
                placeholder="Add other specialty (e.g. Stonework)"
                className="flex-1 bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-1.5 text-[12.5px]"
              />
              <button
                type="button"
                onClick={addCustomService}
                className="px-3 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--palm)] hover:text-white text-[var(--ink)] font-bold text-[12px] transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 rounded-2xl bg-[var(--surface-2)] text-[var(--ink)] font-bold text-[14px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-2xl bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[14px] shadow-xs active:scale-98 transition-all"
            >
              {isEditing ? 'Save Crew Profile' : 'Register Landscaper'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
