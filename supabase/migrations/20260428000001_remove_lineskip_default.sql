-- Remove the hardcoded 'LineSkip' default from company_name
ALTER TABLE profiles ALTER COLUMN company_name DROP DEFAULT;

-- Clear 'LineSkip' from every account that got it auto-populated
UPDATE profiles SET company_name = NULL WHERE company_name = 'LineSkip';
