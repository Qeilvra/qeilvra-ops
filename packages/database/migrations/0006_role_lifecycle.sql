-- Preserve role codes/grants; only active roles contribute effective authority.
ALTER TABLE airmech.roles ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE INDEX user_roles_role_users ON airmech.user_roles (role_code, user_id);

-- Disabling an invitation must not allow enable to bypass password setup.
ALTER TABLE airmech.users ADD COLUMN disabled_from_status text
  CHECK (disabled_from_status IN ('active', 'invited'));
CREATE INDEX users_email_prefix ON airmech.users (lower(email) text_pattern_ops);
CREATE INDEX users_name_prefix ON airmech.users (lower(display_name) text_pattern_ops);
