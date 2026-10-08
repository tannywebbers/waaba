-- Allow a customer to appear as SEPARATE contacts when their loan/app details
-- differ. A phone number alone no longer forces a single contact per user.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_user_id_phone_unique;

-- Still prevent exact duplicate rows (same user + phone + loan).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contacts_user_id_phone_loan_unique'
      AND conrelid = 'contacts'::regclass
  ) THEN
    ALTER TABLE contacts ADD CONSTRAINT contacts_user_id_phone_loan_unique UNIQUE (user_id, phone, loan_id);
  END IF;
END $$;