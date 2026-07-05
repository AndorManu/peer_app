-- ============================================================================
-- Peer — M8 document intelligence (RAG)
-- Embedding provider: OpenAI text-embedding-3-small → 1536 dimensions.
-- The table was empty until now, so the dimension change is free.
-- ============================================================================

alter table public.document_chunks
  alter column embedding type vector(1536);

-- HNSW works on an empty table and needs no retraining as data arrives.
create index if not exists document_chunks_embedding_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

create index if not exists document_chunks_by_document
  on public.document_chunks (user_id, document_id);

-- Similarity search. SECURITY INVOKER (the default) so the caller's RLS
-- applies — a user can only ever match their own chunks; the server's
-- service-role calls pass an explicit user filter.
create or replace function public.match_document_chunks(
  query_embedding vector(1536),
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
