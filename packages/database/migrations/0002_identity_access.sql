-- Supabase owns identity credentials. The API owns business profiles and RBAC.
-- No users, default administrators or permission grants are created here.
CREATE SCHEMA airmech;
REVOKE ALL ON SCHEMA airmech FROM PUBLIC;

CREATE TABLE airmech.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL UNIQUE,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  employee_code text UNIQUE CHECK (length(employee_code) BETWEEN 1 AND 64),
  job_title text CHECK (length(job_title) <= 120),
  phone text CHECK (length(phone) <= 40),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON airmech.users (lower(email));
CREATE INDEX users_status_page ON airmech.users (status, created_at, id);

CREATE TABLE airmech.roles (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{0,63}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120)
);
INSERT INTO airmech.roles (code, name) VALUES
  ('super_admin', 'Super Admin'), ('management', 'Management'),
  ('sales_admin', 'Sales / Admin'), ('service_manager', 'Service Manager'),
  ('engineer', 'Engineer / Technician'), ('project_manager', 'Project Manager'),
  ('accounts', 'Accounts'), ('store', 'Store / Inventory');

CREATE TABLE airmech.permissions (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 200)
);
INSERT INTO airmech.permissions (code, description) VALUES
  ('user.read', 'View application users'), ('user.create', 'Create application users'),
  ('user.update', 'Update application user profiles'), ('user.disable', 'Disable application users'),
  ('admin.users', 'Assign or remove application user roles'),
  ('admin.roles', 'Manage approved role permission grants'),
  ('customer.read', 'View authorized customers'), ('customer.write', 'Maintain authorized customers'),
  ('quotation.create', 'Create authorized quotations'), ('quotation.approve', 'Approve authorized quotations'),
  ('complaint.create', 'Create authorized complaints'), ('complaint.assign', 'Assign authorized complaints'),
  ('complaint.resolve', 'Resolve authorized complaints'), ('complaint.close', 'Close authorized complaints'),
  ('workorder.read', 'View authorized work orders'), ('workorder.update_own', 'Update assigned work orders'),
  ('report.read', 'View authorized reports'), ('report.export', 'Export authorized reports');
CREATE TABLE airmech.user_roles (
  user_id uuid NOT NULL REFERENCES airmech.users(id) ON DELETE RESTRICT,
  role_code text NOT NULL REFERENCES airmech.roles(code) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, role_code)
);
CREATE TABLE airmech.role_permissions (
  role_code text NOT NULL REFERENCES airmech.roles(code) ON DELETE RESTRICT,
  permission_code text NOT NULL REFERENCES airmech.permissions(code) ON DELETE RESTRICT,
  PRIMARY KEY (role_code, permission_code)
);

-- Append-only application audit. No credentials, submitted passwords or tokens.
CREATE TABLE airmech.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES airmech.users(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  entity_type text NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 64),
  entity_id uuid,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_page ON airmech.audit_events (entity_type, entity_id, occurred_at DESC, id DESC);
CREATE FUNCTION airmech.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON airmech.audit_events FOR EACH STATEMENT EXECUTE FUNCTION airmech.reject_audit_mutation();

-- RLS has no browser policies. Only the trusted API DB role may receive grants.
ALTER TABLE airmech.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE airmech.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE airmech.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE airmech.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE airmech.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE airmech.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA airmech FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA airmech FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA airmech FROM PUBLIC;
