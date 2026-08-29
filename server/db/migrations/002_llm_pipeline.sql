-- ============================================================================
-- 002_llm_pipeline.sql
--
-- Schema for the LLM grading pipeline (RAG-lite):
--   - pgvector extension + textbook_chunks: each uploaded textbook is chunked
--     and embedded once at upload time.
--   - test_question_context: retrieval is run once per (test, question) pair
--     and cached here, not once per student submission. A test with 40
--     students answering the same question does one vector search, not 40.
--
-- No ANN index (ivfflat/hnsw) on the embedding column by design — at the
-- scale of a few textbooks per class (low thousands of chunks at most), a
-- plain sequential scan with the <=> operator is fast enough, and an ANN
-- index needs a representative amount of data to train well. Revisit if a
-- single class's textbook corpus grows large enough for this to matter.
--
-- Requires the `vector` extension to be installed on the Postgres server
-- itself (not just enabled here). If CREATE EXTENSION fails, install
-- pgvector for your Postgres version first: https://github.com/pgvector/pgvector
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- Xenova/bge-small-en-v1.5 (self-hosted via @huggingface/transformers, see
-- services/llmService.js) produces 384-dimensional vectors.
CREATE TABLE IF NOT EXISTS public.textbook_chunks (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1),
    textbook_id integer NOT NULL,
    chunk_index integer NOT NULL,
    chunk_text text NOT NULL,
    embedding vector(384),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT textbook_chunks_pkey PRIMARY KEY (id),
    CONSTRAINT textbook_chunks_textbook_id_fkey FOREIGN KEY (textbook_id)
        REFERENCES public.textbooks (id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT textbook_chunks_unique_index UNIQUE (textbook_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_textbook_chunks_textbook_id ON public.textbook_chunks (textbook_id);

CREATE TABLE IF NOT EXISTS public.test_question_context (
    test_id integer NOT NULL,
    question_id integer NOT NULL,
    context_text text NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT test_question_context_pkey PRIMARY KEY (test_id, question_id),
    CONSTRAINT test_question_context_test_id_fkey FOREIGN KEY (test_id)
        REFERENCES public.tests (id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT test_question_context_question_id_fkey FOREIGN KEY (question_id)
        REFERENCES public.questions (id) ON UPDATE NO ACTION ON DELETE CASCADE
);

COMMIT;
