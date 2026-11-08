# RootWise — AI Collaboration Protocol

## Purpose
Coordinate ChatGPT and Claude as one development team through the shared GitHub repository. This protocol does not imply direct access to either assistant's private conversation history. The repository is the shared source of truth.

## Before starting any task
Each assistant must:
1. Read `ROOTWISE_MASTER_CONTEXT.md`.
2. Read this file and `AI_TASK_HANDOFF.md`.
3. Read the relevant architecture/feature documentation and inspect the current code.
4. Check open Issues, active Pull Requests, recent commits, and branches for overlapping work.
5. State the exact files/services it plans to change and identify protected systems.
6. Avoid asking the owner to repeat decisions already recorded here.

## Task ownership and coordination
- Every substantial task should have a GitHub Issue or a clearly documented task entry.
- One assistant is the implementation owner for a task; the other is the independent reviewer unless the owner explicitly requests pair implementation.
- Do not have both assistants edit the same files/branch concurrently.
- Use separate branches named `ai/chatgpt/<short-task>` and `ai/claude/<short-task>`, or a neutral `feat/`, `fix/`, or `docs/` branch when appropriate.
- Use small, focused commits with descriptive messages.
- Submit changes through Pull Requests. Do not push directly to `main`.
- Before a reviewer begins, the implementation owner updates the handoff with branch, commit, changed files, tests, known risks, and questions.
- The reviewer independently inspects the diff and relevant surrounding code; do not approve solely from the author's summary.
- Resolve review comments and rerun relevant tests before merge.
- The owner makes final product/architecture decisions. Obtain explicit approval before consequential production operations.

## Required handoff format
Update `AI_TASK_HANDOFF.md` at task start and completion with:
- Task / Issue:
- Status: proposed | in progress | review requested | blocked | complete
- Implementation owner:
- Reviewer:
- Branch and latest commit:
- Goal and acceptance criteria:
- Files/services changed:
- Tests run and results:
- Database/Worker/deployment effects:
- Known risks or unresolved questions:
- Next action and who owns it:

## Review checklist
- Correctness and maintainability.
- Security, authentication, authorization, RLS, and secret handling.
- Data provenance, privacy, and botanical verification status.
- Backward compatibility and migration safety.
- Tests for success, failure, and permission boundaries.
- No fabricated success states or mocked production results.
- Documentation and handoff updated.
- CI checks pass, or failures are explicitly explained.

## Botanical knowledge contributions
ChatGPT and Claude may help extract, normalize, compare, and critique botanical information from authorized project materials and images. They must record candidate contributions with source and confidence. Neither assistant may silently mark its own generated claims as scientifically verified. A human/scientific review gate remains authoritative.

## Gemini runtime role
Gemini is an internal product AI provider, not the coordinator of the two coding assistants. Call it only for tasks that require its model capabilities. Prefer deterministic code, existing approved records, and local processing for routine work. The owner's approximate 10% usage goal is a planning preference, not a hard-coded service quota until defined and measured.

## Python/ML role
Python is a planned specialist service. Do not add it until the repository audit identifies a concrete use case, data flow, deployment target, security model, and evaluation plan. Keep ML training separate from online inference and from Knowledge Center ingestion.

## Communication limitations
GitHub is the durable coordination channel, but it does not automatically send private chat context from ChatGPT to Claude or vice versa. Each assistant must be given the repository link and asked to read the shared context/handoff. Notifications or agent-to-agent automation require separately configured integrations and permissions.
