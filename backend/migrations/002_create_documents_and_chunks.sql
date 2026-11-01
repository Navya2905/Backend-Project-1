-- Uploaded PDFs, and the text passages (chunks) cut from them with their embeddings.

CREATE TABLE documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  uploaded_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  filename        text NOT NULL,
  storage_key     text NOT NULL UNIQUE,
  size_bytes      integer NOT NULL CHECK (size_bytes > 0),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error           text,
  page_count      integer,
  chunk_count     integer,
  -- Which embedding model produced this document's vectors. Vectors from
  -- different models can't be compared, so search only uses matching ones.
  embedding_model text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Lets chunks reference (id, workspace_id) together; see below.
  UNIQUE (id, workspace_id)
);

-- "List this workspace's documents, newest first."
CREATE INDEX documents_workspace_created_idx ON documents (workspace_id, created_at DESC);

CREATE TABLE chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL,
  workspace_id uuid NOT NULL,
  chunk_index  integer NOT NULL CHECK (chunk_index >= 0),
  page_number  integer NOT NULL CHECK (page_number >= 1),
  content      text NOT NULL,
  embedding    vector(1024) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index),
  -- A chunk's workspace must be its document's workspace. Checked by the
  -- database itself, so a bug can't file a chunk under the wrong team.
  FOREIGN KEY (document_id, workspace_id) REFERENCES documents (id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX chunks_workspace_id_idx ON chunks (workspace_id);

-- Approximate nearest-neighbour index for cosine-distance search (the <=> operator).
CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);
