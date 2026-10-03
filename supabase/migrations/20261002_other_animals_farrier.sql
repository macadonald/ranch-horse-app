-- History-only: column already added live in Supabase
ALTER TABLE other_animals ADD COLUMN IF NOT EXISTS farrier text;
