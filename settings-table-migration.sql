-- Create settings table for dynamic pricing and other configurations
-- Run this SQL in your Supabase dashboard (SQL Editor)

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  hourly_rate INT NOT NULL DEFAULT 350,
  currency VARCHAR(3) NOT NULL DEFAULT 'PHP',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CHECK (id = 1) -- Ensure only one row exists
);

-- Set up RLS (Row Level Security)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Public can read settings
CREATE POLICY "Allow public read" ON settings
  FOR SELECT USING (true);

-- Only admin can update settings (we'll check auth in the API)
-- The API will handle authentication, so this just prevents direct table access
CREATE POLICY "Allow authenticated updates" ON settings
  FOR UPDATE USING (false) -- Enforced via API
  WITH CHECK (false);

-- Insert default row if it doesn't exist
INSERT INTO settings (id, hourly_rate, currency)
VALUES (1, 350, 'PHP')
ON CONFLICT (id) DO NOTHING;
