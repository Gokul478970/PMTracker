# User Stories & Features — E2E RFP Engineering Platform

**Personas:** `Bid Manager` · `Solution Architect` · `Vault Admin` · `Delivery Lead` · `System (AI Pipeline)`

---

## Epic 1 — RFP Ingestion & Document Management

| # | User Story | Acceptance Criteria |
|---|---|---|
| 1.1 | As a **Bid Manager**, I want to upload an RFP as a PDF or DOCX so that the system can begin automated analysis without me manually copy-pasting content. | Accepts PDF/DOCX up to 50MB. Extracts full text including tables. Stores original in S3/MinIO. Returns engagement ID immediately. |
| 1.2 | As a **Bid Manager**, I want to attach an organization name and RFP title at upload so that the engagement is correctly identified throughout the pipeline. | Both fields mandatory. Title pre-populated from filename. Stored in `rfp_engagements`. |
| 1.3 | As a **Bid Manager**, I want the system to detect and preserve section structure from the uploaded document so that the triage analysis is granular and section-aware. | Parser identifies section headers (numbered, uppercase, "Section X" patterns). Section list visible in triage output. |
| 1.4 | As a **Bid Manager**, I want duplicate submissions detected so that the same RFP is not processed twice and vector storage is not polluted. | Checksum (SHA-256) comparison on upload. Returns existing engagement ID if match found. |
| 1.5 | As a **Bid Manager**, I want to set a submission deadline and priority level when creating an engagement so that the dashboard can surface urgent bids. | Priority 1–5 stars. Deadline shown with urgency highlighting when <7 days away. |

---

## Epic 2 — Triage & Scope Classification

| # | User Story | Acceptance Criteria |
|---|---|---|
| 2.1 | As a **Bid Manager**, I want every RFP section automatically classified as In-Scope, Out-of-Scope, or Partial so that I don't spend hours manually reading the full document before deciding whether to bid. | Every section gets one of: `IN_SCOPE`, `OUT_OF_SCOPE`, `PARTIAL`, `REQUIRES_CLARIFICATION`. Classification shown with colour-coded cards. |
| 2.2 | As a **Bid Manager**, I want Out-of-Scope sections (Production Support, Manual Testing, Legacy Dev, Data Migration, Data Pipelines) hard-blocked and flagged with a referral note so that DPE never inadvertently commits to work it cannot deliver. | OOS sections cannot be reclassified to IN_SCOPE without human override. Referral note populated (e.g., "Refer to Managed Services practice"). |
| 2.3 | As a **Bid Manager**, I want a pre-scan keyword alert before the LLM runs so that obvious OOS content is caught even if the model hallucinates an in-scope classification. | 16 regex patterns run first. Results injected into the LLM prompt as `[PRE-SCAN ALERT]`. Any section whose summary still triggers OOS keywords is automatically demoted to `REQUIRES_CLARIFICATION`. |
| 2.4 | As a **Bid Manager**, I want a triage confidence score and a recommended action (PROCEED / PARTIAL_PROCEED / REJECT / CLARIFY) so that I can make a go/no-go call in under 2 minutes. | Score 0–1 displayed as percentage. Colour: green >80%, amber 60–80%, red <60%. Recommendation displayed prominently. |
| 2.5 | As a **Bid Manager**, I want to see the detected technology stack and business domains from the RFP so that I can quickly assess fit before reading the full triage report. | Detected tech shown as pills (e.g., "Spring Boot", "React"). Domains shown in a different colour (e.g., "Banking", "Healthcare"). |
| 2.6 | As a **Bid Manager**, I want Partial sections to clearly state which sub-requirements are in-scope vs OOS so that the solution design only covers the deliverable portion. | Partial cards expandable. In-scope portion and OOS exclusion reason both visible. |
| 2.7 | As a **System**, I want the triage result and OOS flags written back to `rfp_engagements` and `triage_results` so that every downstream agent can reference the classification without re-running the LLM. | Structured `TriageOutput` JSON persisted. `oos_flagged_sections` array on the engagement record. |

---

## Epic 3 — Clarification / Gap Analysis

| # | User Story | Acceptance Criteria |
|---|---|---|
| 3.1 | As a **Bid Manager**, I want the system to automatically generate a prioritised list of clarification questions so that I don't miss estimation-critical information gaps before drafting the solution. | Max 12 questions. Each has: category (SCOPE/TECHNICAL/COMMERCIAL/TIMELINE/INTEGRATION), priority (HIGH/MEDIUM/LOW), and an internal rationale note. |
| 3.2 | As a **Bid Manager**, I want questions ranked by priority so that if the client only answers 5, I've captured the most important unknowns first. | Questions ordered HIGH → MEDIUM → LOW. Priority badge visible on each card. |
| 3.3 | As a **Bid Manager**, I want each question to include an internal rationale (invisible to the client) explaining why that gap blocks estimation so that I can confidently justify the question if the client pushes back. | Rationale shown in a distinct "INTERNAL" callout section. Not included in the client-facing export. |
| 3.4 | As a **System**, I want the inquiry agent to query The Vault for known estimation gap patterns so that the questions reflect DPE's accumulated experience, not generic boilerplate. | Vault query `"common estimation gaps for DPE projects"` with min_score 0.65. Vault patterns included in the LLM prompt. |
| 3.5 | As a **Bid Manager**, I want questions about Out-of-Scope items (testing, support, legacy) to be automatically excluded from the generated list so that I don't accidentally signal interest in OOS work to the client. | Post-generation filter removes any question whose text contains OOS category keywords. |

---

## Epic 4 — Human-in-the-Loop (HIL) Approval Gate

| # | User Story | Acceptance Criteria |
|---|---|---|
| 4.1 | As a **Bid Manager**, I want the pipeline to pause after question generation so that I can review, edit, approve, or reject each question before it reaches the client. | LangGraph `interrupt` fired at `hil_gate` node. Dashboard shows "⏸ Awaiting Review" status. No email/notification sent until explicit approval. |
| 4.2 | As a **Bid Manager**, I want to edit the client-facing text of any question inline so that the tone and wording matches our relationship with that client. | In-place textarea edit per question. Edited version stored in `hil_edited_text`. Original preserved for audit. |
| 4.3 | As a **Bid Manager**, I want to approve questions individually (not all-or-nothing) so that I can send only the highest-value questions and avoid asking the client for unnecessary information. | Per-question approve toggle. Submit sends only `hil_approved = true` questions. |
| 4.4 | As a **Bid Manager**, I want the approval action logged with my name and timestamp so that there is a full audit trail of who approved what. | `hil_reviewed_by` and `hil_reviewed_at` stored in `clarification_questions`. Immutable after submission. |
| 4.5 | As a **Bid Manager**, I want the workflow to proceed directly to solution design if I reject all questions so that low-ambiguity RFPs are not delayed by the HIL gate. | If zero questions approved, `route_after_hil` jumps to `solution_architect_agent` node, bypassing `awaiting_client`. |

---

## Epic 5 — Client Communication & Response Handling

| # | User Story | Acceptance Criteria |
|---|---|---|
| 5.1 | As a **Bid Manager**, I want approved questions exported in a clean, professional format (no internal notes, no rationale) so that the document I send the client looks polished. | Export uses `hil_edited_text` if available, else `question_text`. Rationale field excluded. Formatted as numbered list. |
| 5.2 | As a **Bid Manager**, I want to upload the client's written responses directly into the platform so that the Solution Architect Agent has access to those answers when drafting the architecture. | `POST /api/v1/rfp/{id}/client-responses` accepts an array of `{question_number, client_answer}`. Resumes LangGraph workflow. |
| 5.3 | As a **Bid Manager**, I want the system to detect if the client answered fewer than 70% of approved questions and loop back for a second inquiry round so that critical gaps are not silently ignored. | `route_after_client_response` checks `answered / approved >= 0.7`. If not, retries inquiry (max 1 retry). |
| 5.4 | As a **Bid Manager**, I want to see which questions are still unanswered so that I can follow up with the client on specific items before the solution is drafted. | Dashboard shows answered/unanswered count per engagement. Unanswered questions highlighted in amber. |

---

## Epic 6 — Solution Architecture Generation

| # | User Story | Acceptance Criteria |
|---|---|---|
| 6.1 | As a **Solution Architect**, I want the agent to produce a complete cloud-native architecture covering microservices, UI, mobile, and modernisation strategy so that I have a strong first draft to refine, not a blank page. | Output includes: executive summary, architecture overview, proposed tech stack (per layer), microservices design list, cloud topology, security approach, and a Mermaid.js architecture diagram. |
| 6.2 | As a **Solution Architect**, I want the agent to pull relevant differentiators, case studies, and accelerators from The Vault and apply them to the solution so that every proposal references our competitive advantages. | Vault queried with 3–4 targeted queries (by service line, tech stack, domain, modernisation). Up to 12 deduplicated results fed to the LLM as synthesised context. |
| 6.3 | As a **Delivery Lead**, I want the architecture to be strictly confined to in-scope DPE service lines so that we never commit to work we cannot staff or deliver. | System prompt hard-blocks OOS services. Post-LLM guardrail scrubs any microservice whose name/responsibility contains OOS terms. Removed services logged as warnings. |
| 6.4 | As a **Solution Architect**, I want the client's clarification answers incorporated into the architectural decisions so that the design reflects their specific constraints, not generic assumptions. | All `client_answer` fields from approved questions injected into the architecture prompt as `CLARIFICATION ANSWERS` section. |
| 6.5 | As a **Solution Architect**, I want the agent to reference The Vault's proprietary content by name only (never reproduce raw text) so that our IP is not exposed to the client in verbatim form. | `VaultQueryResult` dataclass has no `raw_text` field by design. Agents receive `synthesized_insight` only. `vault_references_used` stores chunk IDs — never source content. |
| 6.6 | As a **Solution Architect**, I want to see which vault assets were referenced in each proposal so that I can audit how our IP library is being used. | `differentiators_applied` list and `vault_references_used` ID list persisted in `solution_architectures` table. Visible in the engagement detail view. |

---

## Epic 7 — Estimation & Work Breakdown Structure

| # | User Story | Acceptance Criteria |
|---|---|---|
| 7.1 | As a **Delivery Lead**, I want a detailed WBS automatically generated from the solution architecture so that I don't have to build the estimation spreadsheet from scratch. | WBS items created per phase (Discovery, Infrastructure, Backend Services, Frontend, Mobile, Integration, DevSecOps, Deployment). One row per microservice/module. |
| 7.2 | As a **Delivery Lead**, I want PERT three-point estimates (best/likely/worst case) per work package so that the final figure reflects real delivery uncertainty. | All three values captured. `weighted_days` auto-computed by DB as `(best + 4×likely + worst) / 6`. |
| 7.3 | As a **Delivery Lead**, I want DPE velocity benchmarks applied consistently so that estimates are calibrated to our actual delivery speed, not industry averages. | Benchmark table in Estimator system prompt (e.g., Spring Boot microservice = 8–15 PD). LLM anchored to these ranges. |
| 7.4 | As a **Delivery Lead**, I want a 15% contingency applied by default with a clear rationale so that proposals are commercially protected from scope creep. | Contingency configurable (default 15%). `subtotal`, `contingency_usd`, and `total_usd` all shown separately in the commercial summary. |
| 7.5 | As a **Delivery Lead**, I want a team composition output (roles × headcount) so that I can cross-check the proposed team against available bench capacity. | `team_composition` dict (e.g., `{"Java Lead": 2, "React Dev": 3, "Architect": 1, "PM": 1}`) stored on `commercial_summary`. |
| 7.6 | As a **Delivery Lead**, I want the pricing model recommendation (Fixed Price / T&M / Hybrid) based on total effort so that the commercial structure matches the engagement risk profile. | Logic: <1500 PD → FIXED_PRICE, >1500 PD → T_AND_M, ambiguous → HYBRID. Documented in estimator prompt. |
| 7.7 | As a **Delivery Lead**, I want Manual Testing and Production Support explicitly excluded from the WBS so that the estimate never inflates scope with OOS labour. | Estimator prompt explicitly labels Phase 7 as "developer testing only" with a hard note that "manual/UAT testing is OOS". |

---

## Epic 8 — Final Proposal Generation

| # | User Story | Acceptance Criteria |
|---|---|---|
| 8.1 | As a **Bid Manager**, I want the system to assemble a complete, professionally written RFP response document so that I receive a near-ready proposal with minimal manual editing. | 12-section document: Cover Letter, ToC, Executive Summary, Requirements Understanding, Scope of Work, Architecture, Delivery Approach, Team, Timeline, Investment, Why DPE, WBS Appendix. |
| 8.2 | As a **Bid Manager**, I want OOS items explicitly called out in the Scope of Work section with a referral note so that the client is formally informed of what is excluded. | Each OOS section appears as: *"[Section X] — Outside DPE Scope. Recommend referral to [practice]."* |
| 8.3 | As a **Bid Manager**, I want the tone to be authoritative and client-outcome focused, not generic vendor boilerplate, so that the proposal reflects the voice of a market leader. | Response Writer system prompt bans filler phrases. Each differentiator cited with an anonymised outcome metric. |
| 8.4 | As a **Bid Manager**, I want the commercial investment section to present totals cleanly without exposing internal day rates or pricing model mechanics so that margin information is protected. | Proposal shows total investment and milestone structure. Daily rates and blended rate NOT included in the client-facing output. |
| 8.5 | As a **Bid Manager**, I want the final proposal exported as Markdown (convertible to DOCX/PDF) so that I can apply the company template before sending. | `final_proposal_text` stored in state and retrievable via `GET /api/v1/rfp/{id}/proposal`. |

---

## Epic 9 — The Vault (Knowledge Base Management)

| # | User Story | Acceptance Criteria |
|---|---|---|
| 9.1 | As a **Vault Admin**, I want to drop PDF/DOCX/TXT files into categorised subfolders and trigger a single command to ingest them all so that populating the knowledge base requires no coding. | `python scripts/ingest_vault.py` scans `vault_docs/{case_studies,differentiators,tech_accelerators,methodologies,pricing_models}/`. Progress table printed per file. |
| 9.2 | As a **Vault Admin**, I want uploaded files automatically sanitised of client names, project names, person names, dollar amounts, and PII before any content is stored so that raw IP is never at risk of exposure through the RAG pipeline. | Pass 1: 8 regex rules (emails, phones, `$` amounts, dates, internal URLs, project codes). Pass 2: LLM rewrites proper nouns to industry descriptors. Sanitization change count reported per file. |
| 9.3 | As a **Vault Admin**, I want service lines, technologies, and industries automatically extracted from each document so that I don't have to manually tag every file. | LLM metadata extraction runs on the first 3000 chars of each document. Fields can be overridden via CLI `--service-lines` flag or API form fields. |
| 9.4 | As a **Vault Admin**, I want re-running the ingestion to skip already-processed files so that I can add new documents to the folder without reprocessing the entire library. | Checksum-based dedup: `{doc_id}__chunk_0000` existence checked in Pinecone before processing. "Already ingested" reported in the summary table. |
| 9.5 | As a **Vault Admin**, I want to ingest a single file via API upload without running the CLI so that new assets can be added from the dashboard while the system is running. | `POST /api/v1/vault/ingest/file` multipart form. Returns `chunks_stored` and `sanitization_changes`. |
| 9.6 | As a **Vault Admin**, I want to search the vault and see metadata-only results (titles, categories, relevance scores, synthesised insights) so that I can verify the quality of retrieval without exposing stored content. | `GET /api/v1/vault/search?query=...` returns `VaultQueryResult` objects — no `raw_text` field. Score, title, service_lines, synthesised_insight shown. |
| 9.7 | As a **Vault Admin**, I want to see total vector count and category breakdown in the Pinecone index so that I know how healthy and populated the knowledge base is. | `GET /api/v1/vault/stats` calls `index.describe_index_stats()`. Returns total vectors and namespace breakdown. |
| 9.8 | As a **System**, I want vault chunks stored with `is_confidential: true`, `description_summary` (first 300 chars), `key_outcomes`, and `applicable_scenarios` metadata so that agents can make relevance decisions without reading raw text. | All five metadata fields populated on every upserted vector. `raw_text` deliberately absent from the Pinecone metadata schema. |

---

## Epic 10 — Bid Manager Dashboard

| # | User Story | Acceptance Criteria |
|---|---|---|
| 10.1 | As a **Bid Manager**, I want a single dashboard showing all active engagements with status, deadline, and pipeline value so that I can manage my entire bid portfolio at a glance. | Table with: Priority stars, Title/Client, Status badge, Deadline, Value (TBD until estimated), Action button. Filterable by status. |
| 10.2 | As a **Bid Manager**, I want a KPI bar at the top showing Active Engagements, Action Required, Response Ready, and Pipeline Value so that the most important numbers are always visible. | KPI bar updates on navigation. "Action Required" highlighted amber when >0. Pipeline Value sums all estimated `total_usd` values. |
| 10.3 | As a **Bid Manager**, I want real-time progress updates as each agent runs so that I don't have to refresh the page to know where the pipeline is. | WebSocket connection per engagement. Events pushed as each agent completes. Event log displayed in a scrollable terminal-style panel. |
| 10.4 | As a **Bid Manager**, I want a visual pipeline tracker showing all 7 stages (Triage → Inquiry → HIL Review → Awaiting Client → Architecture → Estimation → Writing) with clear active/complete/pending states so that I can see exactly where any engagement is stuck. | Step indicators with colour: green (complete), blue (active), amber (HIL/client wait), grey (pending). Connector lines between steps. |
| 10.5 | As a **Bid Manager**, I want the dashboard to highlight the two HIL interrupt points (Question Review and Client Response) distinctly from automated steps so that I never miss an action that is waiting on me. | HIL steps shown in amber with `👤` prefix. "⏸ Awaiting Review" badge shown. Dashboard KPI increments "Action Required" counter. |
| 10.6 | As a **Bid Manager**, I want rejected RFPs to display a clear rejection banner with the triage reason so that I can record why we chose not to bid and communicate this to stakeholders. | Red banner on rejected engagements showing OOS section count and recommended_action from triage. Engagement frozen — no further pipeline steps available. |

---

## Epic 11 — Security, IP Protection & Audit

| # | User Story | Acceptance Criteria |
|---|---|---|
| 11.1 | As a **Delivery Lead**, I want every agent invocation logged with input/output snapshots, token counts, duration, and vault chunks used so that I can audit cost and quality retroactively. | `agent_run_logs` table populated after every agent. Input/output snapshots sanitised (no vault raw text). Queryable by engagement or agent name. |
| 11.2 | As a **Delivery Lead**, I want the system to prevent raw vault content from ever appearing in agent prompts or API responses so that our proprietary IP cannot be extracted via the RFP response. | Structural enforcement: `VaultQueryResult` has no `raw_text` field. `vault_references_used` stores chunk IDs only. Agents receive `synthesized_insight` summaries. |
| 11.3 | As a **Vault Admin**, I want all vault documents marked `is_confidential: true` by default so that a misconfigured query cannot accidentally expose source content. | Default `True` in `VaultDocument` dataclass and `VaultIngestionService._embed_and_store`. Cannot be set to `False` via the API without an explicit admin override. |
| 11.4 | As a **Delivery Lead**, I want HIL approvals and client response uploads to be timestamped and attributed to a named user so that there is a non-repudiable audit trail for every human decision in the pipeline. | `hil_reviewed_by`, `hil_reviewed_at`, `client_answered_at` stored in `clarification_questions`. Cannot be overwritten after initial write. |
| 11.5 | As a **Bid Manager**, I want the final proposal to never contain internal rate cards, blended day rates, or pricing model mechanics so that margin information is protected from the client. | Response Writer system prompt explicitly instructs: "Do NOT reveal internal rates." `daily_rate_usd` fields from WBS excluded from the user-facing proposal section. |

---

## Epic 12 — Configuration & DevOps

| # | User Story | Acceptance Criteria |
|---|---|---|
| 12.1 | As a **Developer**, I want a single `docker-compose up` to spin up the full local environment (API, React UI, PostgreSQL, MinIO) so that onboarding takes minutes, not hours. | Five services defined: `backend`, `frontend`, `postgres`, `minio`, `adminer`. `schema.sql` auto-applied on first run. |
| 12.2 | As a **Developer**, I want all credentials and configuration managed via a `.env` file so that secrets are never hard-coded in source. | `.env.example` documents all required variables. Pydantic `Settings` class reads from environment. `lru_cache` prevents repeated disk reads. |
| 12.3 | As a **Developer**, I want the Azure OpenAI deployment name, endpoint, and API version independently configurable so that I can point the same codebase at different Azure deployments for dev/staging/production without code changes. | Five distinct env vars: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT_NAME`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`. |
| 12.4 | As a **Developer**, I want the LangGraph workflow state persisted in PostgreSQL so that a server restart does not lose in-flight engagement progress and HIL interrupts survive process restarts. | `AsyncPostgresSaver` configured as LangGraph checkpointer. State restorable by `engagement_id`. |
| 12.5 | As a **Developer**, I want the vault ingestion CLI to be runnable independently of the API server so that the knowledge base can be pre-populated during CI/CD or before go-live without the full stack running. | `python scripts/ingest_vault.py` loads `.env` directly via `python-dotenv`. No FastAPI dependency. |

---

## Summary

| Epic | Title | Stories |
|---|---|---|
| 1 | RFP Ingestion & Document Management | 5 |
| 2 | Triage & Scope Classification | 7 |
| 3 | Clarification / Gap Analysis | 5 |
| 4 | Human-in-the-Loop (HIL) Approval Gate | 5 |
| 5 | Client Communication & Response Handling | 4 |
| 6 | Solution Architecture Generation | 6 |
| 7 | Estimation & Work Breakdown Structure | 7 |
| 8 | Final Proposal Generation | 5 |
| 9 | The Vault (Knowledge Base Management) | 8 |
| 10 | Bid Manager Dashboard | 6 |
| 11 | Security, IP Protection & Audit | 5 |
| 12 | Configuration & DevOps | 5 |
| **Total** | | **68** |
