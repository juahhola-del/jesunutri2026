alter table product_code_links add column label_image_path text;
alter table product_code_links add column label_image_id text;
alter table product_code_links add column label_text_ocr text;

create table if not exists product_label_images (
  id text primary key,
  product_code_link_id text references product_code_links(id) on delete set null,
  product_id text references productos_insumos(id) on delete set null,
  image_path text not null,
  image_hash text,
  captured_at text not null default (datetime('now')),
  created_by text,
  notes text,
  ocr_text text,
  metadata_json text
);

create index if not exists idx_product_label_images_link
on product_label_images(product_code_link_id);

create index if not exists idx_product_label_images_product
on product_label_images(product_id);

create table if not exists operator_scan_sessions (
  id text primary key,
  operator_id text,
  operator_email text,
  operator_name text,
  status text not null default 'active',
  started_at text not null default (datetime('now')),
  last_activity_at text not null default (datetime('now')),
  submitted_at text,
  reviewed_by text,
  reviewed_by_email text,
  reviewed_at text,
  notes text,
  timeout_minutes integer not null default 30,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists idx_operator_scan_sessions_status
on operator_scan_sessions(status);

create index if not exists idx_operator_scan_sessions_operator
on operator_scan_sessions(operator_id);

create table if not exists operator_scan_session_items (
  id text primary key,
  session_id text not null references operator_scan_sessions(id) on delete cascade,
  product_id text,
  product_code_link_id text,
  raw_code text,
  normalized_code text,
  product_name_snapshot text,
  package_type text,
  package_quantity real,
  package_unit text,
  base_unit text,
  conversion_factor real,
  package_count real,
  total_quantity real,
  lot text,
  expiry_date text,
  mfg_date text,
  confidence real,
  image_path text,
  status text not null default 'pending',
  notes text,
  metadata_json text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists idx_operator_scan_items_session
on operator_scan_session_items(session_id);

create trigger if not exists trg_operator_scan_sessions_updated_at
after update on operator_scan_sessions
for each row
begin
  update operator_scan_sessions set updated_at = datetime('now') where id = old.id;
end;

create trigger if not exists trg_operator_scan_items_updated_at
after update on operator_scan_session_items
for each row
begin
  update operator_scan_session_items set updated_at = datetime('now') where id = old.id;
end;
