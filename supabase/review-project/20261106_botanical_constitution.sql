-- Verde Roatan TV project (moaqgqbqfeckeabigfha) ONLY.
-- Botanical Knowledge Center constitution: written rules, version history, and proposed amendments.
-- Service-role only (RLS on, no policies): reached through the constitution worker, never the app.

CREATE TABLE IF NOT EXISTS public.constitution_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE CHECK (rule_key ~ '^[a-z0-9_]{3,60}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 10 AND 2000),
  locked boolean NOT NULL DEFAULT false,   -- core rules: the system and admins cannot weaken or remove them
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.constitution_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.constitution_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  changed_by text,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, version)
);

CREATE TABLE IF NOT EXISTS public.constitution_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('add_rule','revise_rule')),
  target_rule_id uuid REFERENCES public.constitution_rules(id) ON DELETE SET NULL,
  proposed_key text CHECK (proposed_key IS NULL OR proposed_key ~ '^[a-z0-9_]{3,60}$'),
  proposed_title text NOT NULL,
  proposed_body text NOT NULL,
  rationale text NOT NULL,
  signal_key text NOT NULL,                 -- which pattern produced it (prevents duplicate proposals)
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amendment_decision_complete CHECK (status = 'pending' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS constitution_amendments_one_pending ON public.constitution_amendments (signal_key) WHERE status = 'pending';

ALTER TABLE public.constitution_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constitution_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constitution_amendments ENABLE ROW LEVEL SECURITY;

-- Locked rules can never be edited, deactivated, unlocked or deleted, by anyone going through the API.
CREATE OR REPLACE FUNCTION public.constitution_protect_locked() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.locked THEN
    RAISE EXCEPTION 'Core constitution rule "%" is locked and cannot be changed', OLD.rule_key;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS constitution_protect_locked ON public.constitution_rules;
CREATE TRIGGER constitution_protect_locked BEFORE UPDATE OR DELETE ON public.constitution_rules
FOR EACH ROW EXECUTE FUNCTION public.constitution_protect_locked();

INSERT INTO public.constitution_rules (rule_key, title, body, locked, updated_by) VALUES
('approved_sources_only', 'Approved sources only',
 'Answers use only documents and records that an administrator approved. Private documents are never used for the public consultant.', true, 'system'),
('never_false_information', 'Never give false information',
 'Never state a fact that the approved sources do not support. If the sources do not say it, answer "not recorded". A confident guess is worse than an honest gap.', true, 'system'),
('cite_the_source', 'Show the source',
 'Every fact points to its document and page. A quoted snippet must really appear in that document''s text, otherwise the fact is rejected.', true, 'system'),
('three_verification_levels', 'Three separate verification levels',
 'AI IDENTIFIED, USER CONFIRMED and SCIENTIFICALLY VERIFIED are different things. A customer saying "yes" never counts as scientific verification; only an administrator with a written scientific basis can verify.', true, 'system'),
('community_stays_separate', 'Community data stays separate',
 'Customer submissions and unverified identifications are never mixed into the authoritative knowledge or the document search until an administrator approves them.', true, 'system'),
('humans_decide', 'Humans decide',
 'Nothing is published, verified, overwritten or changed in this constitution without administrator approval. Drafts stay drafts until reviewed.', true, 'system'),
('safety_first', 'Safety first',
 'Toxicity and pet or child safety are always flagged and never played down. When safety information is missing, say so.', true, 'system'),
('learn_carefully', 'Learn carefully, never silently',
 'The system may study approvals, rejections, identification results and the knowledge database to notice its own mistakes, but a lesson can only become a proposed amendment. Unverified customer feedback is a hint, never evidence, and learning never changes an answer or a rule without administrator approval.', true, 'system')
ON CONFLICT (rule_key) DO NOTHING;

INSERT INTO public.constitution_rule_versions (rule_id, version, title, body, changed_by, change_note)
SELECT id, 1, title, body, 'system', 'Initial core rule' FROM public.constitution_rules
ON CONFLICT (rule_id, version) DO NOTHING;
