-- ============================================================================
-- Peer — provider-agnostic embeddings at 1024 dimensions.
-- OpenAI text-embedding-3-small natively supports dimensions=1024 (Matryoshka
-- truncation) and Voyage 3.5 / 3.5-lite support output_dimension=1024, so one
-- column serves either provider. Table is empty (test data cleaned up).
-- ============================================================================

drop function if exists public.match_document_chunks(vector(1536), uuid, text, int);

drop index if exists document_chunks_embedding_idx;

alter table public.document_chunks
  alter column embedding type vector(1024) using null;

create index document_chunks_embedding_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

create or replace function public.match_document_chunks(
  query_embedding vector(1024),
  match_user uuid,
  match_project text default null,
  match_count int default 6
)
returns table (
  id text,
  document_id text,
  chunk_index int,
  content text,
  document_name text,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    coalesce(d.name, 'Document') as document_name,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  left join public.documents d
    on d.user_id = c.user_id and d.id = c.document_id
  where c.user_id = match_user
    and c.embedding is not null
    and (match_project is null or d.project_id = match_project)
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;
