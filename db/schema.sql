-- RTA Cabinet Factory — PostgreSQL schema (spec section 23, minimum conceptual schema).
CREATE EXTENSION IF NOT EXISTS citext;
-- PROPOSED. The in-memory store in apps/api mirrors these tables for development.
-- Integrity rules from section 23 are enforced with constraints, not application code alone.
-- Money: integer minor units (cents). Lengths: decimal millimeters. Public IDs: UUID.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- identity
CREATE TABLE app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('factory', 'professional', 'supplier')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_member (
  organization_id uuid NOT NULL REFERENCES organization(id),
  user_id         uuid NOT NULL REFERENCES app_user(id),
  role            text NOT NULL CHECK (role IN ('pro_owner','pro_staff','internal_designer','support','catalog_manager','factory_planner','warehouse','finance','admin')),
  revoked_at      timestamptz,
  PRIMARY KEY (organization_id, user_id, role)
);

-- ---------------------------------------------------------------- catalog
CREATE TABLE product_family (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  construction    text NOT NULL,
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE catalog_version (
  version         text PRIMARY KEY,
  published_at    timestamptz,
  approved_by     uuid REFERENCES app_user(id)
);

CREATE TABLE sku (
  code              text NOT NULL,
  catalog_version   text NOT NULL REFERENCES catalog_version(version),
  family_id         text NOT NULL REFERENCES product_family(id),
  name              text NOT NULL,
  kind              text NOT NULL,
  status            text NOT NULL CHECK (status IN ('draft','active','discontinued','archived')),
  mounting          text NOT NULL,
  width_mm          numeric(10,3) NOT NULL CHECK (width_mm > 0),
  depth_mm          numeric(10,3) NOT NULL CHECK (depth_mm > 0),
  height_mm         numeric(10,3) NOT NULL CHECK (height_mm > 0),
  material          text NOT NULL,
  finish            text,
  purchasability    text NOT NULL CHECK (purchasability IN ('purchasable','quote_required','visualization_only')),
  fulfillment_stage text NOT NULL,
  retail_price_cents integer CHECK (retail_price_cents >= 0),
  tax_category      text NOT NULL,
  pro_only          boolean NOT NULL DEFAULT false,
  exterior_rated    boolean NOT NULL DEFAULT false,
  bom_revision      text,
  panel_thickness_mm numeric(6,2),
  edge_treatment    text,
  attributes        jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (code, catalog_version),
  CHECK (purchasability <> 'purchasable' OR retail_price_cents IS NOT NULL)
);

CREATE TABLE compatibility_rule (
  part_code        text NOT NULL,
  body_family_id   text NOT NULL REFERENCES product_family(id),
  catalog_version  text NOT NULL REFERENCES catalog_version(version),
  PRIMARY KEY (part_code, body_family_id, catalog_version)
);

CREATE TABLE catalog_import (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by     uuid NOT NULL REFERENCES app_user(id),
  status          text NOT NULL CHECK (status IN ('staged','approved','rejected','published')),
  report          jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- pricing
CREATE TABLE price_book_version (
  id              text NOT NULL,
  version         text NOT NULL,
  effective_from  timestamptz NOT NULL,
  effective_to    timestamptz,
  approved_by     uuid REFERENCES app_user(id),
  PRIMARY KEY (id, version)
);

CREATE TABLE price_book_entry (
  price_book_id   text NOT NULL,
  version         text NOT NULL,
  sku_code        text NOT NULL,
  price_cents     integer NOT NULL CHECK (price_cents >= 0),
  PRIMARY KEY (price_book_id, version, sku_code),
  FOREIGN KEY (price_book_id, version) REFERENCES price_book_version(id, version)
);

-- ---------------------------------------------------------------- projects and design
CREATE TABLE project (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       uuid REFERENCES app_user(id),
  owner_org_id        uuid REFERENCES organization(id),
  guest_token_hash    text UNIQUE,
  guest_expires_at    timestamptz,
  name                text NOT NULL,
  approved_revision   integer,
  access_window_start timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(owner_user_id, owner_org_id, guest_token_hash) = 1)
);

-- Immutable saved revisions; optimistic concurrency via (project_id, number) uniqueness.
CREATE TABLE design_revision (
  project_id        uuid NOT NULL REFERENCES project(id),
  number            integer NOT NULL CHECK (number > 0),
  schema_version    integer NOT NULL,
  catalog_version   text NOT NULL,
  document          jsonb NOT NULL,
  content_hash      text NOT NULL,
  created_by        uuid REFERENCES app_user(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, number)
);
ALTER TABLE project ADD CONSTRAINT project_approved_revision_fk
  FOREIGN KEY (id, approved_revision) REFERENCES design_revision(project_id, number) DEFERRABLE INITIALLY DEFERRED;

CREATE RULE design_revision_immutable AS ON UPDATE TO design_revision DO INSTEAD NOTHING;

CREATE TABLE project_access_grant (
  project_id      uuid NOT NULL REFERENCES project(id),
  grantee_org_id  uuid NOT NULL REFERENCES organization(id),
  permission      text NOT NULL CHECK (permission IN ('view','comment','edit')),
  granted_by      uuid NOT NULL REFERENCES app_user(id),
  revoked_at      timestamptz,
  PRIMARY KEY (project_id, grantee_org_id)
);

CREATE TABLE validation_result (
  project_id      uuid NOT NULL,
  revision        integer NOT NULL,
  ruleset_version text NOT NULL,
  catalog_version text NOT NULL,
  fit_status      text NOT NULL CHECK (fit_status IN ('verified','incomplete','failed')),
  results         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, revision, ruleset_version, catalog_version),
  FOREIGN KEY (project_id, revision) REFERENCES design_revision(project_id, number)
);

CREATE TABLE quote (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid,
  revision            integer,
  price_book_version  text NOT NULL,
  policy_version      text NOT NULL,
  catalog_version     text NOT NULL,
  content_hash        text,
  total_cents         integer NOT NULL,
  body                jsonb NOT NULL,
  locked              boolean NOT NULL DEFAULT false,
  created_by          uuid REFERENCES app_user(id),
  created_at          timestamptz NOT NULL,
  expires_at          timestamptz NOT NULL,
  FOREIGN KEY (project_id, revision) REFERENCES design_revision(project_id, number),
  CHECK (expires_at > created_at)
);

CREATE TABLE approval (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL,
  revision        integer NOT NULL,
  content_hash    text NOT NULL,
  quote_id        uuid NOT NULL REFERENCES quote(id),
  approved_by     uuid NOT NULL REFERENCES app_user(id),
  approved_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, revision) REFERENCES design_revision(project_id, number)
);

-- ---------------------------------------------------------------- commerce
CREATE TABLE customer_order (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id       uuid REFERENCES app_user(id),
  buyer_org_id        uuid REFERENCES organization(id),
  project_id          uuid,
  revision            integer,
  content_hash        text,
  quote_id            uuid NOT NULL REFERENCES quote(id),
  total_cents         integer NOT NULL CHECK (total_cents >= 0),
  commercial_status   text NOT NULL,
  payment_status      text NOT NULL,
  manufacturing_status text NOT NULL,
  factory_review_cleared boolean NOT NULL DEFAULT false,
  idempotency_key     text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_user_id, idempotency_key),
  FOREIGN KEY (project_id, revision) REFERENCES design_revision(project_id, number)
);

-- Snapshots: later catalog edits cannot alter the purchased contract.
CREATE TABLE order_line (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES customer_order(id),
  sku_code          text NOT NULL,
  description       text NOT NULL,
  configuration     jsonb NOT NULL DEFAULT '{}',
  quantity          integer NOT NULL CHECK (quantity > 0),
  unit_price_cents  integer NOT NULL CHECK (unit_price_cents >= 0),
  adjustments_cents integer NOT NULL DEFAULT 0,
  tax_cents         integer NOT NULL CHECK (tax_cents >= 0),
  fulfillment_stage text NOT NULL,
  design_instance_ids text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE payment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES customer_order(id),
  provider            text NOT NULL,
  provider_payment_id text NOT NULL,
  amount_cents        integer NOT NULL CHECK (amount_cents > 0),
  status              text NOT NULL,
  raw_status          text,
  UNIQUE (provider, provider_payment_id)
);

CREATE TABLE refund (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      uuid NOT NULL REFERENCES payment(id),
  order_line_id   uuid REFERENCES order_line(id),
  amount_cents    integer NOT NULL CHECK (amount_cents > 0),
  status          text NOT NULL CHECK (status IN ('pending','succeeded','failed')),
  authorized_by   uuid NOT NULL REFERENCES app_user(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- inventory
CREATE TABLE stock_position (
  sku_code        text NOT NULL,
  warehouse_id    text NOT NULL,
  on_hand         integer NOT NULL CHECK (on_hand >= 0),
  quarantined     integer NOT NULL DEFAULT 0 CHECK (quarantined >= 0),
  safety_stock    integer NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  last_synced_at  timestamptz,
  PRIMARY KEY (sku_code, warehouse_id),
  CHECK (quarantined <= on_hand)
);

-- Reserve with SELECT ... FOR UPDATE on stock_position inside one transaction (AC15.1).
CREATE TABLE reservation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code        text NOT NULL,
  warehouse_id    text NOT NULL,
  quantity        integer NOT NULL CHECK (quantity > 0),
  holder_id       text NOT NULL,
  status          text NOT NULL CHECK (status IN ('active','committed','released','expired')),
  expires_at      timestamptz NOT NULL,
  FOREIGN KEY (sku_code, warehouse_id) REFERENCES stock_position(sku_code, warehouse_id)
);

CREATE TABLE stock_ledger (
  id              bigserial PRIMARY KEY,
  sku_code        text NOT NULL,
  warehouse_id    text NOT NULL,
  delta           integer NOT NULL,
  reason          text NOT NULL,
  actor_id        uuid REFERENCES app_user(id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- factory
CREATE TABLE production_job (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES customer_order(id),
  release_key     text NOT NULL UNIQUE,  -- prevents duplicate jobs for the same approved release (AC19.3)
  bom_hash        text NOT NULL,
  design_hash     text NOT NULL,
  status          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE part (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_job_id uuid NOT NULL REFERENCES production_job(id),
  order_line_id   uuid NOT NULL REFERENCES order_line(id),
  assembly_id     text NOT NULL,
  material        text NOT NULL,
  thickness_mm    numeric(6,2) NOT NULL CHECK (thickness_mm > 0),
  cut_length_mm   numeric(10,3) NOT NULL CHECK (cut_length_mm > 0),
  cut_width_mm    numeric(10,3) NOT NULL CHECK (cut_width_mm > 0),
  grain           text,
  edges           jsonb NOT NULL DEFAULT '{}',
  operations      jsonb NOT NULL DEFAULT '[]',
  revision        integer NOT NULL,
  barcode         text UNIQUE NOT NULL
);

-- ---------------------------------------------------------------- fulfillment
CREATE TABLE shipment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES customer_order(id),
  stage           text NOT NULL,
  state           text NOT NULL,
  is_replacement  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shipment_line (
  shipment_id     uuid NOT NULL REFERENCES shipment(id),
  order_line_id   uuid NOT NULL REFERENCES order_line(id),
  quantity        integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (shipment_id, order_line_id)
);

CREATE TABLE claim (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id   uuid NOT NULL REFERENCES order_line(id),
  shipment_id     uuid REFERENCES shipment(id),
  quantity        integer NOT NULL CHECK (quantity > 0),
  damage_type     text NOT NULL,
  status          text NOT NULL,
  replacement_allowance integer NOT NULL DEFAULT 0 CHECK (replacement_allowance >= 0)
);

-- ---------------------------------------------------------------- pros, CRM, leads
CREATE TABLE subscription (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organization(id),
  plan_id                   text NOT NULL,
  status                    text NOT NULL,
  paid_through              timestamptz,
  cancel_at_period_end      boolean NOT NULL DEFAULT false,
  provider_subscription_id  text UNIQUE
);

CREATE TABLE professional_verification (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  status          text NOT NULL CHECK (status IN ('pending','verified','rejected','expired','suspended')),
  expires_at      timestamptz,
  service_zips    text[] NOT NULL DEFAULT '{}',
  services        text[] NOT NULL DEFAULT '{}'
);

-- Organization-scoped clients: email is NOT globally unique (spec section 17).
CREATE TABLE client_record (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name            text NOT NULL,
  email           citext,
  phone           text,
  consent         jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, email)
);

CREATE TABLE lead (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode            text NOT NULL CHECK (mode IN ('customer_selected','claimable','auto_assigned','private')),
  service         text NOT NULL,
  zip             text NOT NULL,
  exclusive       boolean NOT NULL,
  max_recipients  integer NOT NULL CHECK (max_recipients > 0),
  origin_org_id   uuid REFERENCES organization(id),
  customer_user_id uuid REFERENCES app_user(id),
  summary         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lead_assignment (
  lead_id         uuid NOT NULL REFERENCES lead(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  action          text NOT NULL,
  at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, organization_id, action)
);
-- Exclusive claim: a partial unique index guarantees one winner (AC18.3).
CREATE TABLE lead_claim (
  lead_id         uuid NOT NULL REFERENCES lead(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  exclusive       boolean NOT NULL,
  PRIMARY KEY (lead_id, organization_id)
);
CREATE UNIQUE INDEX lead_claim_exclusive_one ON lead_claim (lead_id) WHERE exclusive;

-- ---------------------------------------------------------------- financing
CREATE TABLE financing_referral (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid REFERENCES project(id),
  applicant_user_id   uuid NOT NULL REFERENCES app_user(id),
  partner_id          text NOT NULL,
  status              text NOT NULL,
  provider_raw_status text,
  requested_amount_cents integer NOT NULL CHECK (requested_amount_cents > 0),
  consent_disclosure_version text NOT NULL,
  consent_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
  -- No income, credit, or government identifiers are stored here (spec 14).
);

-- ---------------------------------------------------------------- integration and audit
CREATE TABLE webhook_receipt (
  provider        text NOT NULL,
  event_id        text NOT NULL,
  type            text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE outbox_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL,
  entity_id       text NOT NULL,
  entity_version  integer NOT NULL,
  organization_id uuid,
  schema_version  integer NOT NULL,
  correlation_id  text NOT NULL,
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz
);

CREATE TABLE idempotency_key (
  scope           text NOT NULL,
  key             text NOT NULL,
  fingerprint     text NOT NULL,
  response        jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

CREATE TABLE audit_event (
  id              bigserial PRIMARY KEY,
  actor_id        uuid,
  action          text NOT NULL,
  object_type     text NOT NULL,
  object_id       text NOT NULL,
  correlation_id  text,
  summary         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
