import { CONSTITUTION_WORKER_URL } from '../data/initialData';

export interface ConstitutionRule {
  id: string; rule_key: string; title: string; body: string;
  locked: boolean; active: boolean; version: number; updated_by?: string | null; updated_at?: string;
}
export interface ConstitutionAmendment {
  id: string; kind: 'add_rule' | 'revise_rule'; proposed_title: string; proposed_body: string; rationale: string;
  evidence: Record<string, unknown>; status: 'pending' | 'approved' | 'rejected';
  decided_by?: string | null; decided_at?: string | null; created_at: string;
}
export interface StudyStats {
  extracted_facts: number; facts_rejected_or_edited: number; identification_submissions: number; identifications_doubted: number;
}

async function call<T>(path: string, token: string, body: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${CONSTITUTION_WORKER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('The constitution service could not be reached. Check that its worker is set up.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 'error') throw new Error(data.error || 'The request failed.');
  return data as T;
}

export const listConstitutionRules = (token: string) => call<{ rules: ConstitutionRule[] }>('/constitution/rules', token);
export const studyConstitutionLessons = (token: string) => call<{ stats: StudyStats; signals: { title: string; rationale: string }[] }>('/constitution/lessons', token);
export const proposeConstitutionAmendments = (token: string) => call<{ created: number; message?: string; stats?: StudyStats }>('/constitution/propose', token);
export const listConstitutionAmendments = (token: string, status: 'pending' | 'approved' | 'rejected') => call<{ amendments: ConstitutionAmendment[] }>('/constitution/amendments', token, { status });
export const decideConstitutionAmendment = (token: string, id: string, decision: 'approve' | 'reject', edits: { title?: string; body?: string; note?: string } = {}) =>
  call<{ decision: string }>('/constitution/decide', token, { amendment_id: id, decision, ...edits });
export const editConstitutionRule = (token: string, id: string, edits: { title?: string; body?: string; active?: boolean; note?: string }) =>
  call<{ rule: ConstitutionRule }>('/constitution/edit-rule', token, { rule_id: id, ...edits });

export interface ConstitutionAskPassage { n: number; document_id: string; document: string; citation?: string | null; page?: number | null; snippet: string; rank: number }
export interface ConstitutionAskResult {
  answered: boolean; answer: string; ai_assisted: false; source: 'documents';
  passages: ConstitutionAskPassage[];
  records: Array<{ scientific_name: string; common_name?: string | null; verification_status: string; description?: string | null; toxicity?: string | null }>;
  safety_note: string | null;
  constitution: { rules_in_force: number; checks: Array<{ key: string; title: string; passed: boolean; detail: string }> };
}
// Documents first: searches approved documents and published records, held to the constitution. No AI.
export const askConstitution = (token: string, question: string, includePrivate: boolean) =>
  call<ConstitutionAskResult>('/constitution/ask', token, { question, include_private: includePrivate });
