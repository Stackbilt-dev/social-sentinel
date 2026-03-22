📘 PROJECT SOURCE-OF-TRUTH (SoT) TEMPLATE

Version: 0.1 – Universal, Project-Agnostic

0. PROJECT METADATA

Project Name:
Repo URL:
Primary Maintainer:
Date Created:
Last Updated:

Short Tagline: (1–2 sentences describing the core purpose)

1. EXECUTIVE SUMMARY

Mission:
Problem It Solves:
Target Users / Market:
High-Level Outcome:

CSA Notes (Intent & Philosophy):
(Why this project matters within the larger ecosystem — optional but useful for NotebookLM and future agents.)

2. SYSTEM / PRODUCT OVERVIEW
2.1 What This Project Is

Clear 3–5 sentence description.

2.2 What This Project Is Not

To prevent scope creep.

2.3 Key Use Cases

Use case 1

Use case 2

Use case 3

2.4 Current Status

(Prototype / MVP / Alpha / Beta / Production)

3. HIGH-LEVEL ARCHITECTURE

(Even if not code-based, describe conceptual components.)

3.1 Components / Modules

For each module:

Name:

Purpose:

Inputs:

Outputs:

Dependencies:

3.2 Data Flow (Text Diagram)

Use plaintext to support NotebookLM:

User → Gateway → Core Service  
        → Data Layer (D1/KV/R2/Other)  
        → External APIs  

3.3 Integrations

List both internal and third-party integrations.

4. DOMAIN MODEL

(Critical for NotebookLM retrieval and synthesis)

4.1 Entities (Generalized)

For each entity:

Name

Description

Key Fields

Relationships

Persistence layer (DB, KV, R2, File, None)

4.2 Events (If Applicable)

Events drive AI, automations, and state machines.

Format:

Event Name

Trigger:

Payload:

Side Effects:

4.3 Schemas / Types

Include any known structure:

```ts
export const ExampleSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  metadata: z.record(z.any()),
});
```

5. FEATURES
5.1 Current Features

Short, bullet-format:

Feature name — 1–2 sentence description

…

5.2 Planned Features / Roadmap

Future feature

Priority

Dependencies

5.3 User Journeys

Narrative style helps NotebookLM:

“A user signs in and…”

“An agent receives an event and…”

6. OPERATIONS

(This section stays generic but structured enough for NotebookLM.)

6.1 Runbooks / SOPs

Daily

Weekly

On-demand

Emergency

6.2 Automation Pipelines

For each:

Trigger

Logic

Storage / Output

6.3 Deployment / Releases

How releases typically happen

Environments

CI/CD notes

7. AI CONFIGURATION (IF APPLICABLE)

(For voice agents, LM workers, generative models, etc.)

7.1 System Prompt

Paste any prompts or instructions here.

7.2 Guardrails / Constraints

(e.g., no hallucination, prefer schemas, follow business rules)

7.3 Memory Strategy

What gets stored

Where

Retention policy

Compression policy

7.4 Retrieval Strategy

How the agent looks up info

Priority of sources

8. PRODUCT & BUSINESS CONTEXT

(This is generic enough to work for any project, including personal games, SaaS, dev tools, etc.)

8.1 Monetization (Optional)

Pricing model

Upsells/cross-sells

Customer segments

8.2 Success Metrics

Examples:

Adoption

Retention

Engagement

Revenue

8.3 Competitive / Market Notes

Short bullets.

9. CROSS-PROJECT CONNECTIONS

(Essential since you run an ecosystem, not isolated apps.)

Shared modules

Shared schemas

Shared user personas

Shared voice agent pipelines

Interactions with SBS / FoodFiles / Arcana / Digital CSA / etc.

10. ARTIFACT LIST

List the physical assets so NotebookLM can reference them.

10.1 Code Artifacts

API routes

Services

Schemas

Workers

CLI tools

10.2 Docs

ADRs

SOPs

Strategy notes

Prompts

10.3 Media

Images

Diagrams

Audio

Model configs

10.4 External References

Links to:

Notion

Google Docs

Drive folders

PRDs

Decks

11. CHANGELOG

Date-stamped entries NotebookLM can understand.

Format:

YYYY-MM-DD — vX.Y — Summary of change


Example:

2025-12-06 — v0.1 — Initial SoT template added to repo.