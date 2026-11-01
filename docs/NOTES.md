# DocuMind: design notes

Why things are built the way they are, what could go wrong, and how to explain it. Read alongside the code; file paths are relative to `backend/` unless they say otherwise.

## 1. The idea in one paragraph

DocuMind is retrieval-augmented generation (RAG) over a team's PDFs. When a PDF is uploaded, a background worker extracts the text page by page, cuts it into short overlapping passages ("chunks"), turns each into an embedding (a 1024-number vector that represents its meaning) and stores it in Postgres with pgvector. When someone asks a question, the question is embedded the same way, the closest passages *from that team only* are found with a similarity search, and an LLM is asked to answer using only those passages and to cite them. If nothing relevant is found, DocuMind says so instead of letting the model guess.

## 2. Architecture decisions

| Decision | Why | Alternative considered |
|---|---|---|
| One NestJS app with modules, worker in the same process | Simple to run, debug and explain. Jobs carry only a document ID, so the worker can move to its own process later without code changes. | Microservices; a separate worker container |
| Postgres + pgvector | Vectors sit next to the relational data, so one query can filter by workspace *and* rank by similarity, inside the same transactions and backups. One less system to run. | Pinecone or another dedicated vector DB |
| Plain SQL with `pg`, hand-written migrations | Full control and visible SQL. Vector search needs raw SQL anyway. Each migration runs in a transaction. | Prisma (type-safe queries, built-in migrations), node-pg-migrate |
| BullMQ on Redis for processing | Upload returns 202 straight away; slow work (parsing, embedding API calls) happens in the background with retries and backoff. | Processing during the request; Postgres-based queue (pg-boss) |
| Provider interfaces for storage, embeddings and the LLM | Swap local disk for S3, or one AI vendor for another, by changing one file. Tests use offline stand-ins. | Calling vendor SDKs directly from services |
| Offline "local" AI providers | The app and its tests run with no API key and no cost. | Requiring a key to do anything |
| JWT access tokens | Stateless: no session table, easy for a single-page app. | Server-side sessions with cookies |
| scrypt (Node built-in) for passwords | Memory-hard, salted, no native dependency to compile. | bcrypt, argon2 |
| Node 24 | NestJS 12 ships ES modules; Jest can only load those from CommonJS on Node 24.9+. Node 24 is the current LTS. | Node 22 (tests failed to load `@nestjs/testing`) |

## 3. Database schema

```
users ──< workspace_members >── workspaces ──< documents ──< chunks
                                         └─────────────────────┘ (chunks also carry workspace_id)
```

- `users`: `email` is unique **case-insensitively** (`UNIQUE INDEX ... (lower(email))`); only a password hash is stored.
- `workspace_members`: primary key `(workspace_id, user_id)` stops double membership; `role` is checked to be `owner` or `member`.
- `documents`: `status` is one of `pending | processing | ready | failed`, with `error` explaining failures. `embedding_model` records which model made its vectors.
- `chunks`: `content`, `page_number`, `embedding vector(1024)`, and `workspace_id`.
  - **Composite foreign key** `(document_id, workspace_id) → documents(id, workspace_id)`: the database itself refuses a chunk whose workspace differs from its document's. Isolation doesn't rely only on application code.
  - **HNSW index** with `vector_cosine_ops` for fast approximate nearest-neighbour search.

Rules live in the database (unique, check, foreign keys) so bad data is refused even if application code has a bug.

## 4. Tenant isolation (the most important security property)

Three layers:

1. **`WorkspaceAccessGuard`** (`src/workspaces/workspace-access.guard.ts`): every route containing `:workspaceId` checks that the logged-in user is a member. Non-members get **404, not 403**, so the API doesn't reveal which workspace IDs exist. The workspace ID used afterwards comes from this check.
2. **Every query filters by `workspace_id`**, including lookups by document ID. Without that, a member of workspace B could pass workspace A's document ID with B's workspace ID in the URL.
3. **The database** ties each chunk's workspace to its document's (composite foreign key).

Tests prove it (`test/documents.e2e-spec.ts`, `test/ask.e2e-spec.ts`): team B can't list, read, delete or retry team A's documents through either workspace URL, can't search inside A's workspace, and a search or question in B's own workspace returns nothing from A, even with an exact-match query.

Possible next step: Postgres row-level security as a fourth layer.

## 5. The ingestion pipeline (`src/ingestion/`)

1. **Validation at upload:** the first bytes must be `%PDF-` (a renamed text file is rejected whatever its extension); the size limit is enforced by multer before our code runs (413).
2. **Text extraction:** `pdf-parse` gives text per page, which is what makes page citations possible.
3. **Chunking** (`chunker.ts`): clean the text (rejoin hyphenated line breaks, collapse whitespace, strip NUL characters Postgres can't store), split into sentences, pack whole sentences up to ~180 words, and start each next chunk with ~30 words of overlap. Chunks never cross pages, so each cites exactly one page. Over-long "sentences" (tables) are cut by words.
   - Trade-off: small chunks are precise but lose context; big chunks keep context but blur the embedding and cost more prompt tokens. A sentence that runs across a page break is split.
   - Complexity: linear in the number of words.
4. **Embedding** in batches of 64.
5. **Saving** in one transaction: delete any chunks from an earlier attempt, insert all chunks with one `INSERT ... SELECT FROM unnest(...)`, mark the document ready. A retry is therefore always safe (idempotent).
6. **Failures:**
   - Problems with the file (no text because it's scanned, damaged or encrypted): marked `failed` with a readable reason, and BullMQ is told not to retry (`UnrecoverableError`).
   - Temporary problems (embedding API down): retried up to 3 times with exponential backoff (5s, 10s); only the last failure marks the document failed. The user can press Retry.

## 6. Retrieval (`src/retrieval/retrieval.service.ts`)

```sql
SELECT ..., c.embedding <=> $question AS distance
FROM chunks c JOIN documents d ON d.id = c.document_id
WHERE c.workspace_id = $1 AND d.status = 'ready' AND d.embedding_model = $current_model
ORDER BY c.embedding <=> $question
LIMIT $k
```

- `<=>` is **cosine distance** (1 − cosine similarity): it compares the *direction* of two vectors, which is what carries meaning.
- Exact search is O(n·d) per query (n chunks, d = 1024 dimensions). The **HNSW** index walks a graph of neighbouring vectors and visits a small fraction of them. It's *approximate*: it trades a little recall for much lower latency.
- **Filtering + HNSW pitfall:** the index finds nearest neighbours first and applies `WHERE` afterwards, so for a small workspace in a large table it can return fewer than `k` rows. `SET LOCAL hnsw.iterative_scan = relaxed_order` (pgvector 0.8) makes it keep scanning until enough rows pass the filter.
- Only vectors from the current embedding model are compared; vectors from different models live in different spaces.

## 7. Answering (`src/ask/`)

1. Retrieve the top 6 passages from this workspace.
2. Drop passages below a similarity threshold. **If none remain, answer "I couldn't find this in your documents" without calling the LLM** (no cost, no chance to invent).
3. Build the prompt (`prompt.ts`): rules in the system prompt; passages as numbered `<source id document page>` blocks. Document text is **XML-escaped**, so a PDF containing `</source>` can't break out and pose as instructions, and the rules tell the model that source text is content, never instructions (prompt-injection defence).
4. Call the LLM. Claude runs with server-side refusal fallback enabled; a safety refusal becomes a neutral "can't be answered" with no citations.
5. **Validate citations** (`citations.ts`): parse `[n]` and `[n, m]` markers, drop ids that weren't sent, and treat an answer with no valid citation as unsupported. Every citation the user sees maps to a real passage, document and page.

Limits: grounding reduces hallucination but doesn't eliminate it. The model can still misread a passage, which is why citations show the excerpt so users can check. Prompt-injection defences reduce risk; the real safeguard is that the model has no tools or permissions to abuse.

## 8. Authentication and API security

- Passwords: scrypt with a random 16-byte salt per user, compared in constant time.
- Login gives the same error for "unknown email" and "wrong password", and checks a dummy hash when the email doesn't exist so response time doesn't reveal whether an account exists.
- JWT signed with `JWT_SECRET` (startup fails if it's missing or under 32 characters); default lifetime 1 hour.
- Global guard: every route needs a token unless marked `@Public()`, so a forgotten decorator fails closed.
- Validation: DTOs with class-validator; unknown fields are rejected (`forbidNonWhitelisted`), which blocks mass-assignment tricks like sending `isAdmin: true`.
- Rate limits: 120 requests/minute by default, 10/minute on register and login, 20/minute on ask. Behind nginx, `TRUST_PROXY=1` makes limits apply per real client instead of to nginx's single address.
- Errors never echo provider responses or stack traces.
- Known trade-off: the frontend keeps the token in `localStorage`, which an XSS bug could read. httpOnly cookies plus CSRF protection would be safer.

## 9. Bugs and problems found while building

| Problem | Cause | Fix |
|---|---|---|
| Whole app crashed when the database restarted | `pg`'s pool emits an `error` event when an idle connection drops; an unhandled `error` event kills Node | Listen for pool errors and log them; the pool discards the broken connection and recovers. `/health` returns 503 while the database is unreachable. |
| `Cannot use import statement` in Jest | NestJS 12 ships ES modules; Jest loads them from CommonJS only on Node ≥ 24.9 | Moved the project to Node 24 |
| `node_modules` about to be committed | `.gitignore` was created in the parent folder, outside the repo; files were already staged | Moved the file into the repo, unstaged and re-staged |
| `has no exported member` at startup | Files created in the editor but never saved (0 bytes) | Saved the files; turned on Auto Save |
| TS1272 on controller parameters | With `isolatedModules` + `emitDecoratorMetadata`, interfaces in decorated signatures must be `import type` | Used `import type` |
| Rate limit would be shared by every user in Docker | Behind nginx, every request comes from nginx's IP | `trust proxy` via `TRUST_PROXY` |

## 10. Tests

- **Unit (30):** chunker (page boundaries, sentence packing, overlap, long tables, empty pages), local embedder, citation parsing, prompt escaping against injection, every branch of `AskService` (threshold, invented citations, refusal, provider errors), and ingestion retry rules (retry vs. fail vs. don't retry).
- **End-to-end (31)** against a real Postgres and Redis, with a separate `documind_test` database recreated on each run and a separate queue prefix: auth, roles, upload validation, background processing to `ready`, failed documents, search, grounded and "no evidence" answers, cross-team isolation.
- **Not covered by automated tests:** the real Claude, Voyage and OpenAI calls (no keys were available), and the frontend (checked by building it and driving its API calls through the dev proxy and through nginx in Docker).

## 11. Limitations and next steps

- Scanned PDFs need OCR (they currently fail with an explanation).
- Similarity thresholds are untuned starting points. Next: a small evaluation set of real questions with expected pages, to measure retrieval hit rate and tune the threshold, chunk size and top-k.
- Hybrid search (keyword + vector) would help with exact terms like policy numbers.
- Files on local disk; S3 behind the existing `StorageService` interface for production.
- Single-turn questions; no conversation memory or saved history.
- PDF parsing runs in the API process and is CPU-bound; for heavy use, run the worker as its own container (no code change needed).
- No per-workspace usage limits or cost tracking for AI calls.
- Row-level security in Postgres as an extra isolation layer.
- Not deployed; no structured logging or metrics yet.

## 12. Interview questions to practise

1. Walk me through what happens from PDF upload to cited answer.
2. Why pgvector instead of a dedicated vector database? What would make you switch?
3. How do you guarantee one team never sees another's data? What would you add?
4. Why chunk documents? How did you choose the size and overlap?
5. What is cosine similarity and why use it for embeddings?
6. What does the HNSW index trade off? What goes wrong when you combine it with a WHERE filter?
7. How do you stop the LLM from making things up? Is that a guarantee?
8. What happens when the documents don't contain the answer?
9. What is prompt injection and how does DocuMind defend against it?
10. Why process PDFs in a queue? What happens when processing fails halfway?
11. How do retries avoid duplicate chunks?
12. Why plain SQL instead of an ORM?
13. What happens if you change the embedding model?
14. How are passwords stored? Why the dummy hash on login?
15. Tell me about a bug you found and how you fixed it. (The pool crash in §9 is a good one.)
