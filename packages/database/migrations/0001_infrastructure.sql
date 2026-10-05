-- Infrastructure only. No authentication or business-domain tables.
CREATE SCHEMA IF NOT EXISTS airmech_infrastructure;
REVOKE ALL ON SCHEMA airmech_infrastructure FROM PUBLIC;
