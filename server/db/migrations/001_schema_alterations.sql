-- ============================================================================
-- 001_schema_alterations.sql
--
-- Brings the existing pgAdmin-created schema up to what the app needs:
--   - standardizes every column name to snake_case (questions/tests/responses
--     were created with squashed-lowercase names like `referenceanswer`,
--     `authorid`, `testid` — everything else already uses snake_case)
--   - drops the UNIQUE constraint on classes.name — classes are separated by
--     id, not name, so two classes are allowed to share a name
--   - user deactivation instead of hard delete (admin add/remove flow)
--   - ownership/audit columns (created_by / created_at) where missing
--   - a real lifecycle for tests (draft/published/closed, results_published)
--   - MCQ questions get an explicit correct answer, not an overloaded field
--   - responses distinguish "ungraded" from "graded 0", record LLM output
--     separately from teacher overrides, and can't be submitted twice
--   - a new textbooks table (per class) to ground the LLM evaluation
--   - indexes for the lookup patterns the controllers already use
--
-- Run this once in pgAdmin's Query Tool (or `psql -f`) against the existing
-- database. Written as idempotent ALTERs (IF NOT EXISTS / guarded CHECKs)
-- so it's safe to re-run if it fails partway through.
-- Assumes the tables are currently empty or near-empty (dev stage) — if any
-- step fails due to existing data (e.g. NULLs where we add NOT NULL), the
-- error will tell you which rows to fix first.
--
-- IMPORTANT: the column renames below will break every controller query
-- that references the old names (referenceanswer, questiontype,
-- maximummarks, authorid, starttime, endtime, testid, studentid,
-- questionid). Update server/controllers/*.js to match before restarting
-- the API — see the companion note after this migration.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- users — already snake_case, just adding columns.
-- Admins need to "remove" a student/teacher/admin, but responses.student_id
-- has no cascading delete (by design, see below) — so hard delete would
-- often be blocked anyway. Deactivate instead of delete.
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ----------------------------------------------------------------------------
-- classes — already snake_case. Drop the name-uniqueness constraint (classes
-- are separated by id; two classes are allowed to share a name) and add
-- audit columns.
-- ----------------------------------------------------------------------------
ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_name_key;

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS created_by integer REFERENCES public.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ----------------------------------------------------------------------------
-- questions — rename to snake_case, then add the columns/constraints that
-- reference the new names.
--   - correct_answer: MCQ grading needs an explicit right answer. Reusing
--     reference_answer for both "correct MCQ option" and "descriptive
--     grounding text" was overloading one column for two purposes.
--   - created_by / created_at: ownership + audit.
--   - CHECK on maximum_marks: guards against 0/negative marks slipping in.
--   - CHECK tying question_type to the fields it actually needs.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.questions RENAME COLUMN referenceanswer TO reference_answer;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.questions RENAME COLUMN questiontype TO question_type;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.questions RENAME COLUMN maximummarks TO maximum_marks;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.questions RENAME CONSTRAINT questions_questiontype_check TO questions_question_type_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS correct_answer text,
    ADD COLUMN IF NOT EXISTS created_by integer REFERENCES public.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
    ALTER TABLE public.questions
        ADD CONSTRAINT questions_maximum_marks_check CHECK (maximum_marks > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.questions
        ADD CONSTRAINT questions_type_fields_check CHECK (
            (question_type = 'MCQ'
                AND correct_answer IS NOT NULL
                AND options IS NOT NULL
                AND array_length(options, 1) >= 2)
            OR
            (question_type = 'descriptive'
                AND reference_answer IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Note: this does NOT check that correct_answer is actually one of the
-- options array — that's cheap to validate in the controller, not worth a
-- DB-level function for.

-- ----------------------------------------------------------------------------
-- tests — rename to snake_case, then add lifecycle columns.
-- Currently just (id, title, author_id, start_time, end_time) — no
-- lifecycle, no way to know if a test is still being drafted or if results
-- are out.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.tests RENAME COLUMN authorid TO author_id;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.tests RENAME COLUMN starttime TO start_time;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.tests RENAME COLUMN endtime TO end_time;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.tests RENAME CONSTRAINT tests_authorid_fkey TO tests_author_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE public.tests
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS results_published boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
    ALTER TABLE public.tests
        ADD CONSTRAINT tests_status_check CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.tests
        ADD CONSTRAINT tests_time_window_check CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- author_id should be required going forward — every test needs a teacher
-- owner. Only run this if there are no existing rows with a NULL author_id;
-- if this fails, backfill author_id on existing rows first, then rerun.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.tests WHERE author_id IS NULL) THEN
        ALTER TABLE public.tests ALTER COLUMN author_id SET NOT NULL;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- test_questions — already snake_case. Needs an explicit order so a test
-- renders the same question sequence to every student (a plain JOIN has no
-- guaranteed order).
-- ----------------------------------------------------------------------------
ALTER TABLE public.test_questions
    ADD COLUMN IF NOT EXISTS position integer;

DO $$ BEGIN
    ALTER TABLE public.test_questions
        ADD CONSTRAINT test_questions_position_unique UNIQUE (test_id, position);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- responses — rename to snake_case, then fix everything the LLM evaluation
-- feature needs that's currently missing:
--   - marks defaults to 0, so "ungraded" and "graded zero" look identical.
--     Switching to nullable numeric (no default) fixes that, and numeric
--     instead of integer allows partial-credit scores (e.g. 7.5/10).
--   - no place to store the LLM's rationale/similarity score, so a teacher
--     reviewing a grade has nothing to check it against.
--   - no distinction between the LLM's original score and a teacher's
--     override, so overriding an evaluation silently destroys the original.
--   - nothing stops the same student answering the same question twice.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE public.responses RENAME COLUMN testid TO test_id;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.responses RENAME COLUMN studentid TO student_id;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.responses RENAME COLUMN questionid TO question_id;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.responses RENAME CONSTRAINT responses_testid_fkey TO responses_test_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.responses RENAME CONSTRAINT responses_studentid_fkey TO responses_student_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.responses RENAME CONSTRAINT responses_questionid_fkey TO responses_question_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE public.responses
    ALTER COLUMN marks DROP DEFAULT,
    ALTER COLUMN marks TYPE numeric(6, 2);

ALTER TABLE public.responses
    ADD COLUMN IF NOT EXISTS submitted_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS similarity_score numeric(4, 3),
    ADD COLUMN IF NOT EXISTS feedback text,
    ADD COLUMN IF NOT EXISTS original_marks numeric(6, 2),
    ADD COLUMN IF NOT EXISTS graded_by integer REFERENCES public.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS graded_at timestamp without time zone;

-- graded_by NULL = auto-graded by the LLM; set = a teacher overrode it.

DO $$ BEGIN
    ALTER TABLE public.responses ADD CONSTRAINT responses_marks_check CHECK (marks >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.responses
        ADD CONSTRAINT responses_similarity_score_check CHECK (similarity_score >= 0 AND similarity_score <= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One attempt per test: a student can only have one response row per
-- question per test. Only run if no duplicates already exist; if this
-- fails, de-duplicate existing rows first, then rerun.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.responses
        GROUP BY test_id, student_id, question_id
        HAVING COUNT(*) > 1
    ) THEN
        ALTER TABLE public.responses
            ALTER COLUMN test_id SET NOT NULL,
            ALTER COLUMN student_id SET NOT NULL,
            ALTER COLUMN question_id SET NOT NULL;

        BEGIN
            ALTER TABLE public.responses
                ADD CONSTRAINT responses_unique_attempt UNIQUE (test_id, student_id, question_id);
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- textbooks (new)
-- One class can have several reference materials (chapters, units, etc.)
-- uploaded over time — no uniqueness constraint on class_id. extracted_text
-- is the plain text the LLM evaluation service reads for grounding;
-- file_path keeps a pointer to the original uploaded file. No embeddings/
-- chunking table yet, per the decision to keep this pass simple — that can
-- be layered on later without touching this table's shape.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.textbooks (
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY (INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1),
    class_id integer NOT NULL,
    title text NOT NULL,
    file_path text NOT NULL,
    extracted_text text,
    processing_status text NOT NULL DEFAULT 'pending',
    uploaded_by integer NOT NULL,
    uploaded_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT textbooks_pkey PRIMARY KEY (id),
    CONSTRAINT textbooks_class_id_fkey FOREIGN KEY (class_id)
        REFERENCES public.classes (id) ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT textbooks_uploaded_by_fkey FOREIGN KEY (uploaded_by)
        REFERENCES public.users (id) ON UPDATE NO ACTION ON DELETE RESTRICT,
    CONSTRAINT textbooks_processing_status_check CHECK (
        processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text])
    )
);

-- ----------------------------------------------------------------------------
-- Indexes for lookup patterns the controllers already use (or will need):
--   - "classes a student/teacher belongs to" (reverse of the existing PK)
--   - "tests assigned to a class" (testController.getTestsByClass)
--   - "a student's scores across tests" (student score view)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON public.class_students (student_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher_id ON public.class_teachers (teacher_id);
CREATE INDEX IF NOT EXISTS idx_test_classes_class_id ON public.test_classes (class_id);
CREATE INDEX IF NOT EXISTS idx_responses_student_id ON public.responses (student_id);
CREATE INDEX IF NOT EXISTS idx_textbooks_class_id ON public.textbooks (class_id);

COMMIT;
