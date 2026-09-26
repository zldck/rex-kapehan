ALTER TABLE IF EXISTS public.verified_emails
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS can_book_without_payment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.verified_emails
SET role = 'member'
WHERE role IS NULL OR role = '';

UPDATE public.verified_emails
SET can_book_without_payment = false
WHERE can_book_without_payment IS NULL;

CREATE INDEX IF NOT EXISTS idx_verified_emails_role
  ON public.verified_emails (role);

CREATE INDEX IF NOT EXISTS idx_verified_emails_can_free_book
  ON public.verified_emails (can_book_without_payment);
