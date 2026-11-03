// Typed definitions for the Botanical Knowledge Center, AI Knowledge Engine & RAG Retrieval Architecture

export type DocumentFormat = 'pdf' | 'csv' | 'xls' | 'xlsx' | 'txt' | 'docx';

export type DocumentProcessingStage =
  | 'uploaded'
  | 'validating'
  | 'extracting_text'
  | 'parsing_botanical_info'
  | 'identifying_scientific_names'
  | 'extracting_botanical_characteristics'
  | 'extracting_horticultural_recommendations'
  | 'extracting_references_sources'
  | 'awaiting_review'
  | 'approved'
  | 'indexed_in_rag'
  | 'available_for_ai_retrieval'
  | 'failed'
  | 'reprocessing'
  | 'cancelled';

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  page_number?: number;
  content: string;
  token_count: number;
  embedding_status: 'pending' | 'generated' | 'indexed' | 'failed';
  vector_id?: string;
  identified_taxa?: string[];
  section_title?: string;
}

export interface ExtractedBotanicalEntity {
  field_name: string;
  category: 'taxonomy' | 'identification' | 'horticulture' | 'regional' | 'health' | 'source';
  extracted_value: any;
  confidence: number; // 0 to 1
  approval_status: 'pending' | 'approved' | 'rejected' | 'modified';
  edited_value?: any;
  source_page?: number;
  source_snippet?: string;
  conflict_with_existing?: {
    existing_value: any;
    conflicting_record_id: string;
    conflicting_record_name: string;
  };
}

export interface BotanicalDocument {
  id: string;
  filename: string;
  original_name: string;
  file_type: DocumentFormat;
  file_size_bytes: number;
  uploaded_at: string;
  uploaded_by: string;
  processing_stage: DocumentProcessingStage;
  stage_progress_pct: number; // 0 to 100
  total_pages?: number;
  processed_pages?: number;
  extracted_plants_count: number;
  chunks_count: number;
  rag_indexed: boolean;
  visibility: 'private' | 'public' | 'restricted';
  error_message?: string;
  warning_message?: string;
  is_duplicate_warning?: boolean;
  duplicate_of_id?: string;
  extracted_taxa: string[];
  extracted_entities: ExtractedBotanicalEntity[];
  raw_text_preview?: string;
  source_institution?: string;
  citation_license?: string;
}

export type KnowledgeVisibility = 'public' | 'private' | 'restricted';

export interface BotanicalTaxonomy {
  kingdom: string;
  division: string;
  class_name: string;
  order: string;
  family: string;
  genus: string;
  species: string;
  subspecies?: string;
  variety?: string;
  cultivar?: string;
  scientific_name: string;
  accepted_name: string;
  author_citation?: string;
  taxonomic_status: 'accepted' | 'synonym' | 'unresolved' | 'provisional';
  synonyms: string[];
  basionym?: string;
}

export interface BotanicalIdentification {
  common_names: {
    es: string[];
    en: string[];
    regional_caribbean?: string[];
    miskito?: string[];
    garifuna?: string[];
  };
  leaf_characteristics: string;
  flower_characteristics: string;
  fruit_characteristics: string;
  stem_characteristics: string;
  root_characteristics: string;
  growth_habit: 'tree' | 'shrub' | 'palm' | 'vine_climber' | 'epiphyte' | 'herbaceous' | 'succulent' | 'grass';
  distinguishing_characteristics: string;
  similar_species: Array<{
    scientific_name: string;
    common_name: string;
    differentiating_trait: string;
  }>;
}

export interface BotanicalHorticulture {
  sunlight_requirements: 'full_sun' | 'partial_shade' | 'deep_shade' | 'filtered_sun';
  watering_requirements: 'low_drought_adapted' | 'moderate' | 'high_tropical' | 'seasonal_wet_dry';
  watering_frequency_days: number;
  soil_preferences: string;
  soil_ph_range: string; // e.g. "6.0 - 7.5"
  drainage: 'rapid_percolation' | 'moderate' | 'standing_water_tolerant' | 'limestone_rubble';
  humidity_requirement: 'high_tropical' | 'moderate' | 'arid_adapted';
  temperature_range_celsius: string; // e.g. "20°C - 34°C"
  fertilization_protocol: string;
  propagation_methods: string[]; // e.g. ["seed", "air_layering", "cuttings", "division"]
  pruning_instructions: string;
  mature_height_meters: number;
  mature_width_meters: number;
  growth_rate: 'slow' | 'moderate' | 'fast' | 'vigorous';
  flowering_season: string;
  maintenance_difficulty: 'easy_low_care' | 'moderate' | 'advanced_horticulturalist';
}

export interface BotanicalRegionalIntelligence {
  native_distribution: string;
  introduced_distribution: string;
  invasive_status: 'native' | 'non_invasive_naturalized' | 'cultivated_only' | 'potentially_invasive' | 'high_risk_invasive';
  climate_tolerance: string;
  salt_tolerance_level: 1 | 2 | 3; // 1 = low, 2 = moderate coastal wind, 3 = beachfront salt spray
  wind_tolerance: 'low' | 'moderate' | 'high_hurricane_resilient';
  drought_tolerance: 'low' | 'moderate' | 'high_island_dry_season';
  rainfall_suitability_mm_year: string;
  elevation_range_meters: string;
  suitability_tropical_coastal: boolean;
  suitability_honduras_caribbean: boolean;
  regional_conservation_status?: 'least_concern' | 'vulnerable' | 'endangered' | 'critically_endangered' | 'protected_honduras';
  ecological_roles?: string[]; // e.g. ["mangrove_buffer", "pollinator_magnet", "erosion_control"]
}

export interface BotanicalHealthProfile {
  common_pests: Array<{
    name: string;
    scientific_name?: string;
    symptoms: string;
    organic_treatment: string;
  }>;
  common_diseases: Array<{
    name: string;
    type: 'fungal' | 'bacterial' | 'viral' | 'physiological';
    symptoms: string;
    treatment: string;
    prevention: string;
  }>;
  nutritional_deficiencies: Array<{
    nutrient: string;
    symptoms: string;
    correction: string;
  }>;
  toxicity_information: {
    is_toxic: boolean;
    toxic_parts?: string[];
    toxicity_level?: 'non_toxic' | 'mild_irritant' | 'toxic_to_pets' | 'severe_danger';
    details: string;
  };
}

export interface BotanicalMediaAsset {
  id: string;
  url: string;
  asset_type: 'main_specimen' | 'leaves' | 'flowers' | 'fruits' | 'bark' | 'growth_habit' | 'comparison' | 'habitat';
  caption: string;
  author_credit?: string;
  license?: string;
  is_primary?: boolean;
}

export interface BotanicalSourceReference {
  id: string;
  source_name: string;
  source_url?: string;
  author_or_institution: string;
  publication_date?: string;
  license_info?: string;
  date_verified: string;
  verification_status: 'verified_authoritative' | 'provisional_review' | 'external_api' | 'unverified';
  document_id?: string;
}

export interface BotanicalProfile {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  visibility: KnowledgeVisibility;
  is_verified: boolean;
  verified_by?: string;
  verified_at?: string;
  verification_level: 'verified_database' | 'external_reference' | 'ai_interpretation' | 'provisional';
  
  taxonomy: BotanicalTaxonomy;
  identification: BotanicalIdentification;
  horticulture: BotanicalHorticulture;
  regional: BotanicalRegionalIntelligence;
  health: BotanicalHealthProfile;
  media: BotanicalMediaAsset[];
  sources: BotanicalSourceReference[];
  
  // Link to Commercial Nursery Catalog
  linked_catalog_item_ids: string[];
  
  // Notes & Audit
  internal_admin_notes?: string;
  audit_version: number;
}

export interface ExternalBotanicalReferenceRecord {
  database_source: 'kew_powo' | 'gbif' | 'world_flora_online' | 'plantnet';
  external_id: string;
  scientific_name: string;
  author: string;
  family: string;
  taxonomic_status: string;
  accepted_scientific_name?: string;
  distribution_summary?: string;
  source_url: string;
  last_queried: string;
}

export interface DuplicateTaxonCandidate {
  id: string;
  primary_id: string;
  primary_name: string;
  secondary_id: string;
  secondary_name: string;
  similarity_score: number;
  reason: 'exact_synonym' | 'orthographic_variant' | 'basionym_conflict' | 'identical_common_name';
  primary_record: BotanicalProfile;
  secondary_record: BotanicalProfile;
}

export interface RAGIndexStats {
  total_documents: number;
  indexed_documents: number;
  pending_indexing: number;
  failed_indexing: number;
  total_chunks: number;
  total_embeddings: number;
  last_indexing_timestamp: string;
  vector_dimension: number;
  index_engine: string;
}

export interface RAGFilterConfig {
  search_method: 'keyword' | 'semantic' | 'hybrid';
  similarity_threshold: number; // e.g. 0.75
  max_retrieved_results: number; // e.g. 5
  language_filter: 'all' | 'es' | 'en';
  regional_scope: 'all' | 'honduras' | 'roatan' | 'caribbean';
  visibility_filter: 'all' | 'public_only' | 'private_only';
  source_filter: 'all' | 'botanical_records' | 'uploaded_documents' | 'external_kew';
}

export interface RAGRetrievedPassage {
  id: string;
  source_type: 'document_chunk' | 'botanical_record' | 'horticultural_guide';
  source_title: string;
  document_id?: string;
  botanical_record_id?: string;
  scientific_name?: string;
  page_number?: number;
  relevance_score: number; // 0 to 1
  retrieval_method_used: 'keyword' | 'semantic' | 'hybrid';
  snippet: string;
  visibility: KnowledgeVisibility;
  verification_status: 'verified_database' | 'external_reference' | 'ai_interpretation' | 'provisional';
}

export interface RAGTestQueryResult {
  query: string;
  filters_applied: RAGFilterConfig;
  execution_time_ms: number;
  retrieved_passages: RAGRetrievedPassage[];
  assembled_context: string;
  synthesized_answer: string;
  accuracy_classification: 'verified_database' | 'external_reference' | 'ai_interpretation' | 'uncertain';
}

export interface BotanicalAssistantMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  content: string;
  accuracy_badge: 'verified_database' | 'external_reference' | 'ai_interpretation' | 'uncertain';
  accuracy_explanation: string;
  referenced_botanical_profiles?: Array<{
    id: string;
    scientific_name: string;
    common_name: string;
    thumbnail?: string;
  }>;
  referenced_commercial_items?: Array<{
    id: string;
    name: string;
    price: number;
    currency: 'HNL' | 'USD';
    stock_status: string;
  }>;
  citations?: Array<{
    source_title: string;
    author: string;
    page_or_url?: string;
    verification_level: string;
  }>;
  suggested_follow_ups?: string[];
}

export interface KnowledgeHealthAudit {
  overall_score_pct: number;
  missing_botanical_fields_count: number;
  duplicate_scientific_names_count: number;
  unresolved_synonyms_count: number;
  unverified_records_count: number;
  failed_imports_count: number;
  outdated_records_count: number;
  missing_source_references_count: number;
  issues: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    category: string;
    record_id?: string;
    record_name?: string;
    description: string;
    action_required: string;
  }>;
}
