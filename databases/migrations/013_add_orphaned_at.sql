-- Add the timestamp used by the document orphan-recovery lifecycle.
-- NULL means the document has no active orphan-recovery clock.
-- The application sets this when a document becomes ORPHANED.

ALTER TABLE public.documents
ADD COLUMN orphaned_at TIMESTAMPTZ;
