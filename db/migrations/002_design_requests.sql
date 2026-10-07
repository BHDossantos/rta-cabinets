-- Allow design-service requests in pilot storage.
ALTER TABLE pilot_entity DROP CONSTRAINT IF EXISTS pilot_entity_kind_check;
ALTER TABLE pilot_entity ADD CONSTRAINT pilot_entity_kind_check CHECK (kind IN (
  'meta','user','project','cart','order','subscription','lead','referral','guest_token',
  'access_window','pro','stock_position','reservation','idempotency','webhook','audit','design_request'));
