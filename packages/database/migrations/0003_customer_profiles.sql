-- Supplied customer codes are stored unchanged; numbering policy is not defined here.
CREATE TABLE airmech.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text NOT NULL UNIQUE CHECK (length(btrim(customer_code)) BETWEEN 1 AND 64),
  company_name text NOT NULL CHECK (length(btrim(company_name)) BETWEEN 1 AND 240),
  primary_contact_id uuid,
  phone text CHECK (length(phone) <= 40),
  email text CHECK (length(email) <= 320),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (archived_at IS NULL OR status = 'inactive')
);
CREATE INDEX customers_status_page ON airmech.customers (status, company_name, id);

-- Contact ownership enforces the primary-contact reference. Administration is TASK-032.
CREATE TABLE airmech.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES airmech.customers(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  phone text CHECK (length(phone) <= 40),
  email text CHECK (length(email) <= 320),
  job_title text CHECK (length(job_title) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, id)
);
ALTER TABLE airmech.customers ADD CONSTRAINT primary_contact_ownership
  FOREIGN KEY (id, primary_contact_id) REFERENCES airmech.customer_contacts(customer_id, id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE airmech.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE airmech.customer_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON airmech.customers, airmech.customer_contacts FROM PUBLIC;
