-- ============================================================================
-- 000_initial_schema.sql
--
-- The base schema, as it was originally created by hand in pgAdmin (never
-- previously captured as a migration). Reconstructed here so a fresh
-- database - like the new Docker/pgvector Postgres instance - can be brought
-- up from nothing before 001_schema_alterations.sql and 002_llm_pipeline.sql
-- run on top of it.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.users
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    name text COLLATE pg_catalog."default" NOT NULL,
    email text COLLATE pg_catalog."default" NOT NULL,
    password_hash text COLLATE pg_catalog."default" NOT NULL,
    role text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['teacher'::text, 'student'::text, 'admin'::text]))
);

CREATE TABLE IF NOT EXISTS public.classes
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    name text COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    CONSTRAINT classes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.class_students
(
    class_id integer NOT NULL,
    student_id integer NOT NULL,
    CONSTRAINT class_students_pkey PRIMARY KEY (class_id, student_id),
    CONSTRAINT class_students_class_id_fkey FOREIGN KEY (class_id)
        REFERENCES public.classes (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT class_students_student_id_fkey FOREIGN KEY (student_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.class_teachers
(
    class_id integer NOT NULL,
    teacher_id integer NOT NULL,
    CONSTRAINT class_teachers_pkey PRIMARY KEY (class_id, teacher_id),
    CONSTRAINT class_teachers_class_id_fkey FOREIGN KEY (class_id)
        REFERENCES public.classes (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT class_teachers_teacher_id_fkey FOREIGN KEY (teacher_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.questions
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    question text COLLATE pg_catalog."default" NOT NULL,
    referenceanswer text COLLATE pg_catalog."default",
    questiontype text COLLATE pg_catalog."default" NOT NULL,
    options text[] COLLATE pg_catalog."default",
    maximummarks integer NOT NULL,
    CONSTRAINT questions_pkey PRIMARY KEY (id),
    CONSTRAINT questions_questiontype_check CHECK (questiontype = ANY (ARRAY['MCQ'::text, 'descriptive'::text]))
);

CREATE TABLE IF NOT EXISTS public.tests
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    title text COLLATE pg_catalog."default" NOT NULL,
    authorid integer,
    starttime timestamp without time zone,
    endtime timestamp without time zone,
    CONSTRAINT tests_pkey PRIMARY KEY (id),
    CONSTRAINT tests_authorid_fkey FOREIGN KEY (authorid)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS public.test_classes
(
    test_id integer NOT NULL,
    class_id integer NOT NULL,
    CONSTRAINT test_classes_pkey PRIMARY KEY (test_id, class_id),
    CONSTRAINT test_classes_class_id_fkey FOREIGN KEY (class_id)
        REFERENCES public.classes (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT test_classes_test_id_fkey FOREIGN KEY (test_id)
        REFERENCES public.tests (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.test_questions
(
    test_id integer NOT NULL,
    question_id integer NOT NULL,
    CONSTRAINT test_questions_pkey PRIMARY KEY (test_id, question_id),
    CONSTRAINT test_questions_question_id_fkey FOREIGN KEY (question_id)
        REFERENCES public.questions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT test_questions_test_id_fkey FOREIGN KEY (test_id)
        REFERENCES public.tests (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.responses
(
    id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    testid integer,
    studentid integer,
    questionid integer,
    answer text COLLATE pg_catalog."default",
    marks integer DEFAULT 0,
    CONSTRAINT responses_pkey PRIMARY KEY (id),
    CONSTRAINT responses_questionid_fkey FOREIGN KEY (questionid)
        REFERENCES public.questions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT responses_studentid_fkey FOREIGN KEY (studentid)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT responses_testid_fkey FOREIGN KEY (testid)
        REFERENCES public.tests (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

COMMIT;
