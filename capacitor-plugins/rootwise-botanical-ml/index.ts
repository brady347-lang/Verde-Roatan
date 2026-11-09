import { registerPlugin } from '@capacitor/core';

export interface RootWiseBotanicalMLReadiness {
  available: boolean;
  modelReady: boolean;
  referenceCatalogReady: boolean;
  ready: boolean;
  modelVersion?: string;
  reason?: string;
}

export interface RootWiseBotanicalMLCandidate {
  id: string;
  common_name: string;
  scientific_name: string;
  family?: string;
  confidence_score: number;
}

export interface RootWiseBotanicalMLResult {
  status: 'success';
  matched: boolean;
  model_version: string;
  inference_time_ms: number;
  delegate_used: 'cpu';
  candidates: RootWiseBotanicalMLCandidate[];
  ml_visual_evidence: {
    status: 'success';
    decision: 'accept' | 'review';
    model_version: string;
    top_predictions: Array<{ label: string }>;
  };
  notice: string;
}

export interface RootWiseBotanicalMLPlugin {
  getReadiness(): Promise<RootWiseBotanicalMLReadiness>;
  identify(options: {
    image: string;
    topK?: number;
  }): Promise<RootWiseBotanicalMLResult>;
}

export const RootWiseBotanicalML = registerPlugin<RootWiseBotanicalMLPlugin>('RootWiseBotanicalML');
