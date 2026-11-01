# DocuMind

A multi-tenant knowledge base for PDFs. Teams upload documents, then ask questions in plain English and get answers grounded in their own files, with a citation to the document and page for every claim. One team can never see another team's documents, passages or answers.

**Stack:** NestJS · PostgreSQL + pgvector · plain SQL (`pg`) · Redis + BullMQ · React + Vite · Docker Compose · Claude API

## How it works

```
Upload                                      Ask
──────                                      ───
POST /documents (PDF)                       POST /ask { question }
  │ check membership, PDF bytes, size         │ check membership
  │ save file, row status = pending           │ embed the question
  │ queue a job → 202 Accepted                │ SQL: nearest passages WHERE workspace_id = $1
  ▼                                           │ none similar enough → "I couldn't find this"
Worker (BullMQ, retries with backoff)         │ prompt: rules + numbered <source> passages
  │ extract text page by page                 │ LLM answers, citing [n]
  │ split into overlapping chunks             │ drop citations to sources never sent
  │ embed each chunk                          ▼
  │ save chunks + vectors in one transaction  { answer, answered, citations[file, page, excerpt] }
  ▼
status = ready (or failed + reason)
```

Tenant isolation is enforced in three places: a guard that checks workspace membership on every workspace route (non-members get 404), a `workspace_id` filter in every query, and a composite foreign key that makes the database reject a chunk filed under a different workspace than its document.

More detail, design decisions and trade-offs: [docs/NOTES.md](docs/NOTES.md).

## Run it

Requirements: Docker Desktop and Node.js 24 (`nvm use` reads `.nvmrc`).

**First time:**

```bash
cp backend/.env.example backend/.env
# then set JWT_SECRET in backend/.env, e.g. to the output of: openssl rand -hex 32
```

**Option A: whole app in Docker**

```bash
docker compose --profile app up --build
```

Open http://localhost:8080. Migrations run automatically when the backend starts.

**Option B: develop locally** (hot reload)

```bash
docker compose up -d                 # Postgres + Redis
cd backend && npm install && npm run db:migrate && npm run start:dev
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. The Vite dev server forwards `/api` to the backend on port 3000.

### AI providers

Out of the box everything runs **offline with no API key**:

- `EMBEDDING_PROVIDER=local` hashes words into vectors. Search matches shared words, not meaning ("vacation" won't find "paid leave").
- `LLM_PROVIDER=local` quotes the best-matching sentences with citations instead of writing an answer.

For real semantic search and written answers, set in `backend/.env`:

```bash
EMBEDDING_PROVIDER=voyage     # or openai
VOYAGE_API_KEY=...            # or OPENAI_API_KEY=...
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
```

Changing the embedding provider changes the vectors. Existing documents won't show up in search until they're uploaded again (search only compares vectors from the same model).

## Tests

```bash
cd backend
npm test            # unit tests (30)
npm run test:e2e    # end-to-end against a separate documind_test database (31); needs Postgres + Redis running
npm run lint
```

The end-to-end tests cover sign-up and login, workspace roles, upload validation (fake PDFs, size limit, scanned and damaged files), background processing, search, grounded answers, "no evidence" answers, and cross-team isolation for documents, search and questions.

## What has and hasn't been verified

| Verified by running it | Written but not yet run against the real service |
|---|---|
| Everything with the offline providers: unit and e2e tests, the dev setup, and the full Docker stack (sign up → upload → process → ask) | Claude answers (`LLM_PROVIDER=anthropic`), Voyage and OpenAI embeddings. No API keys were available while building. The code type-checks against the SDK and API shapes, and the provider interface is covered by tests with stand-ins. |

The similarity thresholds that decide "I couldn't find this" (`RETRIEVAL_MIN_SIMILARITY`) are starting points, not measured values. Tune them with real questions once a real embedding model is in use.

## API

All routes are under `/api`. Everything except register, login and health needs `Authorization: Bearer <token>`.

| Method | Path | |
|---|---|---|
| GET | `/health` | Database connectivity and pgvector version |
| POST | `/auth/register` | `{ email, password, name, workspaceName? }`, creates a personal workspace |
| POST | `/auth/login` | `{ email, password }` → `{ accessToken, user }` |
| GET | `/auth/me` | Current user and their workspaces |
| GET / POST | `/workspaces` | List mine / create `{ name }` |
| GET / POST | `/workspaces/:id/members` | List / add `{ email, role? }` (owners only) |
| GET / POST | `/workspaces/:id/documents` | List / upload (multipart field `file`, 202 Accepted) |
| GET / DELETE | `/workspaces/:id/documents/:docId` | Status and details / delete (uploader or owner) |
| POST | `/workspaces/:id/documents/:docId/retry` | Re-queue a failed document |
| POST | `/workspaces/:id/search` | `{ query, limit? }`, raw passage search |
| POST | `/workspaces/:id/ask` | `{ question }` → `{ answer, answered, citations }` |

## Project layout

```
docker-compose.yml       Postgres+pgvector, Redis; backend+frontend under the "app" profile
backend/
  migrations/            Numbered SQL files, applied in order by scripts/migrate.js
  src/
    auth/                Register, login, JWT guard, password hashing (scrypt)
    workspaces/          Teams, roles, WorkspaceAccessGuard
    documents/           Upload, list, delete, retry
    storage/             StorageService interface; local disk implementation
    ingestion/           PDF text extraction, chunking, BullMQ worker
    ai/                  Embedding and LLM provider interfaces + implementations
    retrieval/           pgvector similarity search
    ask/                 RAG: prompt, citations, "no evidence" handling
  test/                  End-to-end tests and fixtures
frontend/                React app (sign-in, documents, ask)
docs/NOTES.md            Design decisions, trade-offs, interview notes
```
