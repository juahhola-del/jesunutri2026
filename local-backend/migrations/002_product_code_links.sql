create table if not exists product_code_links (
  id text primary key,
  product_id text not null references productos_insumos(id),
  code_raw text not null,
  code_normalized text not null,
  code_type text,
  gtin text,
  barcode_format text,
  gs1_payload_json text,
  detected_lot text,
  detected_expiry text,
  detected_mfg_date text,
  detected_quantity real,
  source text not null default 'camera_learning',
  confidence real not null default 0,
  created_by text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  last_seen_at text not null default (datetime('now')),
  scan_count integer not null default 1,
  is_active integer not null default 1
);

create unique index if not exists idx_product_code_links_code_normalized
on product_code_links(code_normalized);

create unique index if not exists idx_product_code_links_product_code
on product_code_links(product_id, code_normalized);

create index if not exists idx_product_code_links_product_id
on product_code_links(product_id);

create index if not exists idx_product_code_links_gtin
on product_code_links(gtin);

create trigger if not exists trg_product_code_links_updated_at
after update on product_code_links
for each row
begin
  update product_code_links set updated_at = datetime('now') where id = old.id;
end;
