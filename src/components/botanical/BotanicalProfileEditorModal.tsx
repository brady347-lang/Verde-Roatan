import React, { useState } from 'react';
import {
  BotanicalProfile,
  KnowledgeVisibility
} from '../../types/botanicalKnowledge';
import { CatalogItem, Language } from '../../types';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Flower2,
  Globe2,
  HeartPulse,
  Info,
  Layers,
  Leaf,
  Link,
  MapPin,
  Palmtree,
  Plus,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Shovel,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  X
} from 'lucide-react';

interface BotanicalProfileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: BotanicalProfile | null;
  onSave: (profile: BotanicalProfile) => void;
  lang: Language;
  catalogItems?: CatalogItem[];
}

export const BotanicalProfileEditorModal: React.FC<BotanicalProfileEditorModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
  lang,
  catalogItems = []
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<
    'taxonomy' | 'identification' | 'horticulture' | 'regional' | 'health' | 'media' | 'sources'
  >('taxonomy');

  const [form, setForm] = useState<BotanicalProfile>(() => {
    if (profile) return JSON.parse(JSON.stringify(profile));
    return {
      id: `bp-custom-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'Verde Lead Taxonomist',
      visibility: 'public',
      is_verified: true,
      verified_by: 'Verde Botanical Board',
      verified_at: new Date().toISOString(),
      verification_level: 'verified_database',
      audit_version: 1,
      linked_catalog_item_ids: [],
      taxonomy: {
        kingdom: 'Plantae',
        division: 'Tracheophyta',
        class_name: 'Magnoliopsida',
        order: 'Lamiales',
        family: 'Bignoniaceae',
        genus: '',
        species: '',
        scientific_name: '',
        accepted_name: '',
        taxonomic_status: 'accepted',
        synonyms: []
      },
      identification: {
        common_names: {
          es: [],
          en: [],
          regional_caribbean: []
        },
        leaf_characteristics: '',
        flower_characteristics: '',
        fruit_characteristics: '',
        stem_characteristics: '',
        root_characteristics: '',
        growth_habit: 'shrub',
        distinguishing_characteristics: '',
        similar_species: []
      },
      horticulture: {
        sunlight_requirements: 'full_sun',
        watering_requirements: 'moderate',
        watering_frequency_days: 3,
        soil_preferences: 'Well-drained coralline sand and organic loam',
        soil_ph_range: '6.5 - 7.5',
        drainage: 'rapid_percolation',
        humidity_requirement: 'high_tropical',
        temperature_range_celsius: '22°C - 34°C',
        fertilization_protocol: 'Balanced organic tropical plant fertilizer every 60 days.',
        propagation_methods: ['cuttings', 'seed'],
        pruning_instructions: 'Prune spent branches after flowering season.',
        mature_height_meters: 3.5,
        mature_width_meters: 2.0,
        growth_rate: 'moderate',
        flowering_season: 'Spring to Summer',
        maintenance_difficulty: 'easy_low_care'
      },
      regional: {
        native_distribution: 'Honduras and the Caribbean Basin',
        introduced_distribution: '',
        invasive_status: 'native',
        climate_tolerance: 'Thrives in tropical coastal microclimates',
        salt_tolerance_level: 2,
        wind_tolerance: 'moderate',
        drought_tolerance: 'moderate',
        rainfall_suitability_mm_year: '1500 - 3000 mm',
        elevation_range_meters: '0 - 300 m',
        suitability_tropical_coastal: true,
        suitability_honduras_caribbean: true,
        regional_conservation_status: 'least_concern',
        ecological_roles: ['pollinator_magnet']
      },
      health: {
        common_pests: [],
        common_diseases: [],
        nutritional_deficiencies: [],
        toxicity_information: {
          is_toxic: false,
          details: 'Non-toxic to pets and humans under standard garden contact.'
        }
      },
      media: [],
      sources: [
        {
          id: `src-${Date.now()}`,
          source_name: 'Verde Herbarium & BICA Roatán Botanical Survey',
          source_url: 'https://powo.science.kew.org',
          author_or_institution: 'Verde Plant Intelligence Research Division',
          date_verified: new Date().toISOString().slice(0, 10),
          verification_status: 'verified_authoritative'
        }
      ]
    };
  });

  const [synonymInput, setSynonymInput] = useState('');
  const [commonEsInput, setCommonEsInput] = useState('');
  const [commonEnInput, setCommonEnInput] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');

  const handleAddSynonym = () => {
    if (!synonymInput.trim()) return;
    setForm((prev) => ({
      ...prev,
      taxonomy: {
        ...prev.taxonomy,
        synonyms: [...prev.taxonomy.synonyms, synonymInput.trim()]
      }
    }));
    setSynonymInput('');
  };

  const handleRemoveSynonym = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      taxonomy: {
        ...prev.taxonomy,
        synonyms: prev.taxonomy.synonyms.filter((_, i) => i !== idx)
      }
    }));
  };

  const handleAddCommonEs = () => {
    if (!commonEsInput.trim()) return;
    setForm((prev) => ({
      ...prev,
      identification: {
        ...prev.identification,
        common_names: {
          ...prev.identification.common_names,
          es: [...prev.identification.common_names.es, commonEsInput.trim()]
        }
      }
    }));
    setCommonEsInput('');
  };

  const handleAddCommonEn = () => {
    if (!commonEnInput.trim()) return;
    setForm((prev) => ({
      ...prev,
      identification: {
        ...prev.identification,
        common_names: {
          ...prev.identification.common_names,
          en: [...prev.identification.common_names.en, commonEnInput.trim()]
        }
      }
    }));
    setCommonEnInput('');
  };

  const handleAddPhoto = () => {
    if (!newPhotoUrl.trim()) return;
    setForm((prev) => ({
      ...prev,
      media: [
        ...prev.media,
        {
          id: `m-${Date.now()}`,
          url: newPhotoUrl.trim(),
          asset_type: 'main_specimen',
          caption: newPhotoCaption.trim() || 'Botanical specimen photo',
          is_primary: prev.media.length === 0
        }
      ]
    }));
    setNewPhotoUrl('');
    setNewPhotoCaption('');
  };

  const handleToggleLinkedCatalogItem = (catalogId: string) => {
    setForm((prev) => {
      const exists = prev.linked_catalog_item_ids.includes(catalogId);
      const nextIds = exists
        ? prev.linked_catalog_item_ids.filter((id) => id !== catalogId)
        : [...prev.linked_catalog_item_ids, catalogId];
      return { ...prev, linked_catalog_item_ids: nextIds };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.taxonomy.scientific_name) {
      form.taxonomy.scientific_name = `${form.taxonomy.genus} ${form.taxonomy.species}`.trim();
    }
    if (!form.taxonomy.accepted_name) {
      form.taxonomy.accepted_name = form.taxonomy.scientific_name;
    }
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] overflow-y-auto">
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--line)] bg-[var(--surface-2)]/60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-[var(--palm)] text-white flex items-center justify-center shadow-xs">
              <Leaf className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-[17px] sm:text-[19px] font-extrabold text-[var(--ink)] leading-tight flex items-center gap-2">
                {profile ? 'Edit Botanical Profile' : 'New Botanical Record'}
                {form.is_verified && (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[var(--palm)] text-white flex items-center gap-0.5">
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </span>
                )}
              </h2>
              <small className="text-[12px] text-[var(--ink-soft)] italic font-mono">
                {form.taxonomy.scientific_name || 'Taxon awaiting classification'}
              </small>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Visibility Toggle */}
            <button
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  visibility: prev.visibility === 'public' ? 'private' : 'public'
                }))
              }
              className={`px-3 py-1.5 rounded-xl text-[11.5px] font-bold border transition-all flex items-center gap-1.5 ${
                form.visibility === 'public'
                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
              }`}
            >
              {form.visibility === 'public' ? (
                <>
                  <Eye className="w-3.5 h-3.5" /> Public Knowledge
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" /> Private Admin
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 7 Tabs Bar */}
        <div className="flex items-center gap-1 px-4 pt-2.5 pb-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface)] no-scrollbar">
          {[
            { id: 'taxonomy', label: '1. Taxonomy', icon: Layers },
            { id: 'identification', label: '2. Identification', icon: Sprout },
            { id: 'horticulture', label: '3. Horticulture', icon: Sun },
            { id: 'regional', label: '4. Regional & Roatán', icon: MapPin },
            { id: 'health', label: '5. Health & Pests', icon: HeartPulse },
            { id: 'media', label: '6. Media & Photos', icon: Flower2 },
            { id: 'sources', label: '7. Sources & Catalog', icon: BookOpen }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-1.5 px-3 rounded-xl text-[11.5px] font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[var(--palm)] text-white shadow-xs'
                    : 'text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* TAB 1: TAXONOMY */}
          {activeTab === 'taxonomy' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 bg-[var(--surface-2)]/50 rounded-2xl border border-[var(--line)] text-[12.5px] text-[var(--ink-soft)] flex items-center gap-2">
                <Info className="w-4 h-4 text-[var(--palm)] shrink-0" />
                <span>
                  Scientifically structured taxonomic hierarchy aligned with Kew Plants of the World Online (POWO) and World Flora Online (WFO).
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Kingdom
                  </label>
                  <input
                    type="text"
                    value={form.taxonomy.kingdom}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        taxonomy: { ...prev.taxonomy, kingdom: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--ink)] focus:outline-[var(--palm)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Family (e.g. Arecaceae, Araceae)
                  </label>
                  <input
                    type="text"
                    required
                    value={form.taxonomy.family}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        taxonomy: { ...prev.taxonomy, family: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold text-[var(--ink)] focus:outline-[var(--palm)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Genus
                  </label>
                  <input
                    type="text"
                    required
                    value={form.taxonomy.genus}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        taxonomy: { ...prev.taxonomy, genus: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold text-[var(--ink)] italic focus:outline-[var(--palm)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Species Epithet
                  </label>
                  <input
                    type="text"
                    required
                    value={form.taxonomy.species}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        taxonomy: { ...prev.taxonomy, species: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold text-[var(--ink)] italic focus:outline-[var(--palm)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Full Scientific Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cocos nucifera L."
                    value={form.taxonomy.scientific_name}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        taxonomy: { ...prev.taxonomy, scientific_name: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-extrabold text-[var(--palm)] italic focus:outline-[var(--palm)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Author Citation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. L., Sp. Pl. 2: 1188 (1753)"
                    value={form.taxonomy.author_citation || ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        taxonomy: { ...prev.taxonomy, author_citation: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12px] font-mono text-[var(--ink-soft)] focus:outline-[var(--palm)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Taxonomic Status
                  </label>
                  <select
                    value={form.taxonomy.taxonomic_status}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        taxonomy: { ...prev.taxonomy, taxonomic_status: e.target.value as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--ink)] focus:outline-[var(--palm)]"
                  >
                    <option value="accepted">Accepted Name (Authoritative)</option>
                    <option value="synonym">Synonym (Linked to Accepted Taxon)</option>
                    <option value="unresolved">Unresolved (Requires Investigation)</option>
                    <option value="provisional">Provisional Field Record</option>
                  </select>
                </div>
              </div>

              {/* Scientific Synonyms Management */}
              <div className="bg-[var(--surface-2)]/40 p-4 rounded-2xl border border-[var(--line)] space-y-2">
                <label className="text-[12px] font-bold text-[var(--ink)] block">
                  Scientific Synonyms & Historical Basionyms
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add scientific synonym (e.g. Tornelia fragrans Gut.)..."
                    value={synonymInput}
                    onChange={(e) => setSynonymInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSynonym();
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] italic text-[var(--ink)]"
                  />
                  <button
                    type="button"
                    onClick={handleAddSynonym}
                    className="px-4 py-2 bg-[var(--palm)] text-white text-[12px] font-bold rounded-xl flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.taxonomy.synonyms.map((syn, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--line)] text-[12px] italic text-[var(--ink-soft)] flex items-center gap-1.5"
                    >
                      {syn}
                      <button
                        type="button"
                        onClick={() => handleRemoveSynonym(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {form.taxonomy.synonyms.length === 0 && (
                    <small className="text-[11.5px] text-[var(--ink-soft)] italic">
                      No synonyms recorded yet.
                    </small>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IDENTIFICATION */}
          {activeTab === 'identification' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Common Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[var(--surface-2)]/40 p-3.5 rounded-2xl border border-[var(--line)] space-y-2">
                  <label className="text-[11.5px] font-bold text-[var(--ink)] block">
                    Nombres Comunes en Español
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Coco, Costilla de Adán..."
                      value={commonEsInput}
                      onChange={(e) => setCommonEsInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCommonEs();
                        }
                      }}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCommonEs}
                      className="px-3 py-1.5 bg-[var(--palm)] text-white text-[11px] font-bold rounded-xl"
                    >
                      Añadir
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {form.identification.common_names.es.map((name, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-[var(--surface)] text-[11.5px] font-semibold text-[var(--ink)] border border-[var(--line)] flex items-center gap-1"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              identification: {
                                ...prev.identification,
                                common_names: {
                                  ...prev.identification.common_names,
                                  es: prev.identification.common_names.es.filter((_, idx) => idx !== i)
                                }
                              }
                            }))
                          }
                        >
                          <X className="w-2.5 h-2.5 text-red-500" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-[var(--surface-2)]/40 p-3.5 rounded-2xl border border-[var(--line)] space-y-2">
                  <label className="text-[11.5px] font-bold text-[var(--ink)] block">
                    English Common Names
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Coconut Palm, Swiss Cheese Plant..."
                      value={commonEnInput}
                      onChange={(e) => setCommonEnInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCommonEn();
                        }
                      }}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCommonEn}
                      className="px-3 py-1.5 bg-[var(--palm)] text-white text-[11px] font-bold rounded-xl"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {form.identification.common_names.en.map((name, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-[var(--surface)] text-[11.5px] font-semibold text-[var(--ink)] border border-[var(--line)] flex items-center gap-1"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              identification: {
                                ...prev.identification,
                                common_names: {
                                  ...prev.identification.common_names,
                                  en: prev.identification.common_names.en.filter((_, idx) => idx !== i)
                                }
                              }
                            }))
                          }
                        >
                          <X className="w-2.5 h-2.5 text-red-500" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Growth Habit */}
              <div>
                <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                  Growth Habit
                </label>
                <select
                  value={form.identification.growth_habit}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      identification: {
                        ...prev.identification,
                        growth_habit: e.target.value as any
                      }
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold text-[var(--ink)]"
                >
                  <option value="tree">Tree (Arbóreo)</option>
                  <option value="shrub">Shrub (Arbusto)</option>
                  <option value="palm">Palm (Arecaceae)</option>
                  <option value="epiphyte">Epiphyte / Climbing Hemiepiphyte</option>
                  <option value="vine_climber">Vine / Climber (Enredadera)</option>
                  <option value="herbaceous">Herbaceous Perennial</option>
                  <option value="succulent">Succulent</option>
                  <option value="grass">Ornamental Grass</option>
                </select>
              </div>

              {/* Organ Diagnostics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Leaf Characteristics & Venation
                  </label>
                  <textarea
                    rows={2}
                    value={form.identification.leaf_characteristics}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        identification: { ...prev.identification, leaf_characteristics: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px] text-[var(--ink)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Flower Morphology & Inflorescence
                  </label>
                  <textarea
                    rows={2}
                    value={form.identification.flower_characteristics}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        identification: { ...prev.identification, flower_characteristics: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px] text-[var(--ink)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Fruit & Seed Characteristics
                  </label>
                  <textarea
                    rows={2}
                    value={form.identification.fruit_characteristics}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        identification: { ...prev.identification, fruit_characteristics: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px] text-[var(--ink)]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Distinguishing Key Trait
                  </label>
                  <textarea
                    rows={2}
                    value={form.identification.distinguishing_characteristics}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        identification: { ...prev.identification, distinguishing_characteristics: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px] text-[var(--ink)]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HORTICULTURE */}
          {activeTab === 'horticulture' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Sunlight Requirement
                  </label>
                  <select
                    value={form.horticulture.sunlight_requirements}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: { ...prev.horticulture, sunlight_requirements: e.target.value as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px] font-semibold"
                  >
                    <option value="full_sun">Full Tropical Sun (Sol Directo)</option>
                    <option value="partial_shade">Partial Shade (Media Sombra)</option>
                    <option value="filtered_sun">Filtered Canopy Sun</option>
                    <option value="deep_shade">Deep Shade (Sombra Total)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Watering Protocol
                  </label>
                  <select
                    value={form.horticulture.watering_requirements}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: { ...prev.horticulture, watering_requirements: e.target.value as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px] font-semibold"
                  >
                    <option value="high_tropical">High Tropical Moisture</option>
                    <option value="moderate">Moderate Moisture</option>
                    <option value="low_drought_adapted">Low / Drought Adapted</option>
                    <option value="seasonal_wet_dry">Seasonal Wet/Dry</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Irrigation Frequency (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={form.horticulture.watering_frequency_days}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: {
                          ...prev.horticulture,
                          watering_frequency_days: Number(e.target.value) || 3
                        }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Soil Preferences & Roatán Calcareous Adaptation
                  </label>
                  <input
                    type="text"
                    value={form.horticulture.soil_preferences}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: { ...prev.horticulture, soil_preferences: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Soil pH Range
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 6.5 - 8.2"
                    value={form.horticulture.soil_ph_range}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: { ...prev.horticulture, soil_ph_range: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                  Fertilization Protocol
                </label>
                <textarea
                  rows={2}
                  value={form.horticulture.fertilization_protocol}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      horticulture: { ...prev.horticulture, fertilization_protocol: e.target.value }
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Mature Height (m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.horticulture.mature_height_meters}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: { ...prev.horticulture, mature_height_meters: Number(e.target.value) || 1 }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Mature Width (m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.horticulture.mature_width_meters}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: { ...prev.horticulture, mature_width_meters: Number(e.target.value) || 1 }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Growth Rate
                  </label>
                  <select
                    value={form.horticulture.growth_rate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: { ...prev.horticulture, growth_rate: e.target.value as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                  >
                    <option value="slow">Slow</option>
                    <option value="moderate">Moderate</option>
                    <option value="fast">Fast</option>
                    <option value="vigorous">Vigorous</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Care Difficulty
                  </label>
                  <select
                    value={form.horticulture.maintenance_difficulty}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        horticulture: { ...prev.horticulture, maintenance_difficulty: e.target.value as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                  >
                    <option value="easy_low_care">Easy / Low Care</option>
                    <option value="moderate">Moderate</option>
                    <option value="advanced_horticulturalist">Advanced</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REGIONAL INFORMATION (Roatán & Honduras) */}
          {activeTab === 'regional' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 text-[12.5px] text-emerald-800 flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Regional suitability criteria for the Bay Islands of Honduras, Caribbean coastal microclimates, and hurricane resilience.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[var(--surface-2)]/40 p-3 rounded-2xl border border-[var(--line)]">
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Salt Spray Tolerance
                  </label>
                  <select
                    value={form.regional.salt_tolerance_level}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        regional: { ...prev.regional, salt_tolerance_level: Number(e.target.value) as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold"
                  >
                    <option value={1}>Grade 1: Sheltered Interior Only</option>
                    <option value={2}>Grade 2: Moderate Island Breeze</option>
                    <option value={3}>Grade 3: Direct Beachfront Salt Spray</option>
                  </select>
                </div>

                <div className="bg-[var(--surface-2)]/40 p-3 rounded-2xl border border-[var(--line)]">
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Wind & Hurricane Resilience
                  </label>
                  <select
                    value={form.regional.wind_tolerance}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        regional: { ...prev.regional, wind_tolerance: e.target.value as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold"
                  >
                    <option value="low">Low (Requires Windbreak)</option>
                    <option value="moderate">Moderate Trade Winds</option>
                    <option value="high_hurricane_resilient">High (Hurricane Resilient)</option>
                  </select>
                </div>

                <div className="bg-[var(--surface-2)]/40 p-3 rounded-2xl border border-[var(--line)]">
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Invasive & Origin Status
                  </label>
                  <select
                    value={form.regional.invasive_status}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        regional: { ...prev.regional, invasive_status: e.target.value as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold"
                  >
                    <option value="native">Native to Honduras / Bay Islands</option>
                    <option value="non_invasive_naturalized">Naturalized (Non-Invasive)</option>
                    <option value="cultivated_only">Cultivated Garden Plant Only</option>
                    <option value="potentially_invasive">Potentially Invasive Alert</option>
                    <option value="high_risk_invasive">High Risk Invasive Specimen</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Native Geographical Distribution
                  </label>
                  <textarea
                    rows={2}
                    value={form.regional.native_distribution}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        regional: { ...prev.regional, native_distribution: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider block mb-1">
                    Honduran Conservation & Legal Status
                  </label>
                  <select
                    value={form.regional.regional_conservation_status || 'least_concern'}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        regional: { ...prev.regional, regional_conservation_status: e.target.value as any }
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px] font-bold"
                  >
                    <option value="least_concern">Least Concern (LC)</option>
                    <option value="protected_honduras">Protected in Honduras (ICF Protected)</option>
                    <option value="vulnerable">Vulnerable (VU)</option>
                    <option value="endangered">Endangered (EN)</option>
                    <option value="critically_endangered">Critically Endangered</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PLANT HEALTH & TOXICITY */}
          {activeTab === 'health' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[var(--surface-2)]/40 p-4 rounded-2xl border border-[var(--line)] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-extrabold text-[var(--ink)] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Toxicity Information (Pets & Humans)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.health.toxicity_information.is_toxic}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          health: {
                            ...prev.health,
                            toxicity_information: {
                              ...prev.health.toxicity_information,
                              is_toxic: e.target.checked
                            }
                          }
                        }))
                      }
                      className="w-4 h-4 accent-red-600 rounded"
                    />
                    <span className="text-[12px] font-bold text-[var(--ink)]">
                      Specimen is Toxic / Irritant
                    </span>
                  </label>
                </div>

                <textarea
                  rows={3}
                  placeholder="Detail toxic parts (leaves, sap, berries), clinical symptoms, and pet precautions..."
                  value={form.health.toxicity_information.details}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      health: {
                        ...prev.health,
                        toxicity_information: {
                          ...prev.health.toxicity_information,
                          details: e.target.value
                        }
                      }
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                />
              </div>
            </div>
          )}

          {/* TAB 6: MEDIA & PHOTOS */}
          {activeTab === 'media' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[var(--surface-2)]/40 p-4 rounded-2xl border border-[var(--line)] space-y-2">
                <label className="text-[12px] font-bold text-[var(--ink)] block">
                  Add Botanical Specimen Photograph (URL)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newPhotoUrl}
                    onChange={(e) => setNewPhotoUrl(e.target.value)}
                    className="sm:col-span-2 px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                  />
                  <input
                    type="text"
                    placeholder="Caption (e.g. Frond detail)..."
                    value={newPhotoCaption}
                    onChange={(e) => setNewPhotoCaption(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12.5px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddPhoto}
                  className="px-4 py-2 bg-[var(--palm)] text-white text-[12px] font-bold rounded-xl flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Attach Photo
                </button>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {form.media.map((m, idx) => (
                  <div
                    key={m.id || idx}
                    className="relative rounded-2xl overflow-hidden border border-[var(--line)] bg-[var(--surface-2)] aspect-4/3 flex flex-col justify-end p-2.5 group"
                  >
                    <img
                      src={m.url}
                      alt={m.caption}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                    <div className="relative z-10 flex items-center justify-between text-white">
                      <span className="text-[11px] font-bold truncate max-w-[80%]">
                        {m.caption}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            media: prev.media.filter((_, i) => i !== idx)
                          }))
                        }
                        className="p-1 rounded-md bg-red-600/80 hover:bg-red-700 text-white"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: SOURCES & LINK TO COMMERCIAL STORE */}
          {activeTab === 'sources' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Linked Commercial Store Products */}
              <div className="bg-[var(--surface-2)]/40 p-4 rounded-2xl border border-[var(--line)] space-y-3">
                <div>
                  <b className="text-[13px] font-extrabold text-[var(--ink)] flex items-center gap-1.5">
                    <Link className="w-4 h-4 text-[var(--palm)]" />
                    Connect to Commercial Nursery Catalog
                  </b>
                  <small className="text-[11.5px] text-[var(--ink-soft)] block">
                    Link this botanical species to live inventory items in the store so customers can purchase specimens.
                  </small>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {catalogItems.map((catItem) => {
                    const isLinked = form.linked_catalog_item_ids.includes(catItem.id);
                    return (
                      <button
                        key={catItem.id}
                        type="button"
                        onClick={() => handleToggleLinkedCatalogItem(catItem.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          isLinked
                            ? 'bg-[var(--palm)]/15 border-[var(--palm)] text-[var(--palm)] font-bold'
                            : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-[12.5px] font-bold">{catItem.name}</span>
                          <span className="text-[10.5px] text-[var(--ink-soft)] italic">
                            {catItem.sci} · {catItem.size}
                          </span>
                        </div>
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[var(--surface-2)]">
                          {isLinked ? 'LINKED' : '+ Link'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Source References */}
              <div className="bg-[var(--surface-2)]/40 p-4 rounded-2xl border border-[var(--line)] space-y-3">
                <b className="text-[13px] font-extrabold text-[var(--ink)] flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-[var(--palm)]" />
                  Primary Botanical Citations & Authorities
                </b>

                {form.sources.map((src, i) => (
                  <div
                    key={src.id || i}
                    className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-xl flex items-center justify-between"
                  >
                    <div className="flex flex-col">
                      <b className="text-[12.5px] text-[var(--ink)]">{src.source_name}</b>
                      <span className="text-[11px] text-[var(--ink-soft)]">
                        {src.author_or_institution} · Verified {src.date_verified}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800">
                      {src.verification_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[var(--line)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--ink-soft)]">
              Version {form.audit_version} · ID: {form.id}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-[12.5px] font-bold text-[var(--ink-soft)] hover:bg-[var(--surface-2)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[var(--palm)] text-white text-[12.5px] font-extrabold shadow-sm hover:brightness-105 flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" /> Save Botanical Record
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
