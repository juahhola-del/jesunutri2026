const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { BACKUP_DIR, DATA_DIR, DB_PATH, LOCAL_ADMIN } = require("./config");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const IMPORT_TABLES = [
  "usuarios_app",
  "productos_insumos",
  "insumo_lotes",
  "movimientos_inventario",
  "ingresos_pendientes",
  "ingresos_pendientes_detalle",
  "daily_tasks",
  "clinical_pac_years",
  "clinical_pac_items",
  "clinical_monthly_orders",
  "clinical_monthly_order_items",
  "clinical_real_order_imports",
  "clinical_real_order_items",
  "clinical_budget_snapshots",
  "clinical_daily_demands",
  "clinical_daily_diet_counts",
  "clinical_daily_enteral_items",
  "clinical_daily_supply_items",
  "clinical_daily_import_errors",
  "clinical_product_links",
  "clinical_demand_product_links",
  "product_code_links"
];
const BOOLEAN_COLUMNS = new Set([
  "activo",
  "critico",
  "favorito",
  "alerta_vencimiento_revisada",
  "desviacion_fifo",
  "ignored",
  "is_active"
]);
const JSON_COLUMNS = new Set([
  "validations",
  "comparison",
  "snapshot_data",
  "gs1_payload_json"
]);
const IMPORT_CONFLICT_KEYS = {
  usuarios_app: [["email"]],
  productos_insumos: [["nombre_normalizado"]],
  clinical_pac_years: [["year", "created_by"]],
  clinical_monthly_orders: [["year", "month", "created_by"]],
  clinical_product_links: [["source_type", "normalized_code", "normalized_name", "source_category", "created_by"]],
  clinical_demand_product_links: [["detected_name", "detected_type", "created_by"]],
  product_code_links: [["code_normalized"], ["product_id", "code_normalized"]]
};
const SELECT_ONLY_TABLES = new Set([
  "inventario_lotes_disponibles",
  "alertas_stock_minimo",
  "historial_movimientos_inventario"
]);

function assertAllowedTable(table, write = false) {
  if (IMPORT_TABLES.includes(table)) return;
  if (!write && SELECT_ONLY_TABLES.has(table)) return;
  throw new Error(`Tabla local no permitida: ${table}`);
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function openDatabase() {
  ensureDirs();
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

function openExistingDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    const error = new Error("Base local pendiente. Ejecuta Preparar modo local.");
    error.code = "LOCAL_DB_PENDING";
    throw error;
  }
  return openDatabase();
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.*\.sql$/i.test(file))
    .sort()
    .map((file) => {
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      return {
        file,
        version: file.match(/^(\d+)/)[1],
        name: file.replace(/^\d+_/, "").replace(/\.sql$/i, ""),
        sql,
        checksum: crypto.createHash("sha256").update(sql).digest("hex")
      };
    });
}

function ensureMigrationTable(db) {
  db.exec(`
    create table if not exists schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at text not null default (datetime('now'))
    );
  `);
}

function listAppliedMigrations(db) {
  try {
    ensureMigrationTable(db);
    return db.prepare("select version, name, checksum, applied_at from schema_migrations order by version").all();
  } catch (error) {
    return [];
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ""), salt, 32).toString("hex");
}

function setLocalPassword(db, userId, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  db.prepare(`
    insert into local_auth_users (user_id, password_salt, password_hash, updated_at)
    values (?, ?, ?, datetime('now'))
    on conflict(user_id) do update set
      password_salt = excluded.password_salt,
      password_hash = excluded.password_hash,
      updated_at = datetime('now')
  `).run(userId, salt, hash);
}

function ensureLocalAdmin(db, { onlyIfEmpty = true } = {}) {
  const userCount = db.prepare("select count(*) as count from usuarios_app").get().count;
  if (onlyIfEmpty && userCount > 0) return false;

  db.prepare(`
    insert into usuarios_app (id, email, nombre, rol, activo)
    values (?, ?, ?, ?, 1)
    on conflict(email) do update set
      nombre = excluded.nombre,
      rol = excluded.rol,
      activo = 1
  `).run(LOCAL_ADMIN.id, LOCAL_ADMIN.email, LOCAL_ADMIN.nombre, LOCAL_ADMIN.rol);

  const admin = db.prepare("select id from usuarios_app where lower(email) = lower(?)").get(LOCAL_ADMIN.email);
  const authRow = admin ? db.prepare("select user_id from local_auth_users where user_id = ?").get(admin.id) : null;
  if (admin && (!authRow || process.env.JESUNUTRI_LOCAL_ADMIN_PASSWORD_RESET === "1")) {
    setLocalPassword(db, admin.id, LOCAL_ADMIN.password);
  }
  return true;
}

function removeLocalAdminSeed(db) {
  const seed = db.prepare("select id from usuarios_app where id = ? and lower(email) = lower(?)")
    .get(LOCAL_ADMIN.id, LOCAL_ADMIN.email);
  if (!seed) return false;
  db.prepare("delete from local_auth_users where user_id = ?").run(LOCAL_ADMIN.id);
  db.prepare("delete from usuarios_app where id = ?").run(LOCAL_ADMIN.id);
  return true;
}

function ensureLocalAdminIfNoUsers() {
  const db = openExistingDatabase();
  try {
    return ensureLocalAdmin(db, { onlyIfEmpty: true });
  } finally {
    db.close();
  }
}

function removeLocalAdminSeedIfPresent() {
  const db = openExistingDatabase();
  try {
    return removeLocalAdminSeed(db);
  } finally {
    db.close();
  }
}

function runMigrations(db, { seedAdmin = true } = {}) {
  ensureMigrationTable(db);
  const files = getMigrationFiles();
  const appliedRows = listAppliedMigrations(db);
  const applied = new Map(appliedRows.map((row) => [row.version, row]));
  const appliedNow = [];

  files.forEach((migration) => {
    const existing = applied.get(migration.version);
    if (existing) {
      if (existing.checksum !== migration.checksum) {
        throw new Error(`La migracion ${migration.file} cambio despues de ser aplicada.`);
      }
      return;
    }

    db.exec("BEGIN;");
    try {
      db.exec(migration.sql);
      db.prepare("insert into schema_migrations (version, name, checksum) values (?, ?, ?)")
        .run(migration.version, migration.name, migration.checksum);
      db.exec("COMMIT;");
      appliedNow.push(migration.version);
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  });

  if (seedAdmin) ensureLocalAdmin(db, { onlyIfEmpty: true });
  return appliedNow;
}

function installDatabase(options = {}) {
  const db = openDatabase();
  try {
    const appliedNow = runMigrations(db, options);
    const status = getStatusFromDatabase(db);
    return {
      ...status,
      status: status.installed ? "instalado" : "pendiente",
      appliedNow
    };
  } finally {
    db.close();
  }
}

function safeCount(db, table) {
  try {
    return db.prepare(`select count(*) as count from ${table}`).get().count;
  } catch (error) {
    return null;
  }
}

function getStatusFromDatabase(db) {
  const migrationFiles = getMigrationFiles();
  const applied = listAppliedMigrations(db);
  const appliedVersions = new Set(applied.map((row) => row.version));
  const pending = migrationFiles.filter((migration) => !appliedVersions.has(migration.version));
  const latest = migrationFiles[migrationFiles.length - 1]?.version || null;
  const current = applied[applied.length - 1]?.version || null;
  const integrityRow = db.prepare("PRAGMA integrity_check").get();
  const journalRow = db.prepare("PRAGMA journal_mode").get();
  const integrity = Object.values(integrityRow || {})[0] || "unknown";
  const journalMode = Object.values(journalRow || {})[0] || "unknown";

  return {
    ok: pending.length === 0 && integrity === "ok",
    status: pending.length === 0 && integrity === "ok" ? "instalado" : "pendiente",
    installed: pending.length === 0 && integrity === "ok",
    databasePath: DB_PATH,
    databaseExists: fs.existsSync(DB_PATH),
    migrationVersion: current,
    latestMigration: latest,
    pendingMigrations: pending.map((migration) => migration.version),
    appliedMigrations: applied.map((row) => ({
      version: row.version,
      name: row.name,
      appliedAt: row.applied_at
    })),
    sqlite: {
      journalMode,
      integrity
    },
    counts: {
      productos: safeCount(db, "productos_insumos"),
      lotes: safeCount(db, "insumo_lotes"),
      movimientos: safeCount(db, "movimientos_inventario"),
      tareas: safeCount(db, "daily_tasks"),
      ingresosPendientes: safeCount(db, "ingresos_pendientes"),
      productCodeLinks: safeCount(db, "product_code_links"),
      pacYears: safeCount(db, "clinical_pac_years"),
      demandasDiarias: safeCount(db, "clinical_daily_demands")
    }
  };
}

function getStatus() {
  if (!fs.existsSync(DB_PATH)) {
    const latest = getMigrationFiles().at(-1)?.version || null;
    return {
      ok: false,
      status: "pendiente",
      installed: false,
      databasePath: DB_PATH,
      databaseExists: false,
      migrationVersion: null,
      latestMigration: latest,
      pendingMigrations: getMigrationFiles().map((migration) => migration.version),
      appliedMigrations: [],
      sqlite: {
        journalMode: "pendiente",
        integrity: "pendiente"
      },
      counts: {}
    };
  }

  const db = openDatabase();
  try {
    return getStatusFromDatabase(db);
  } finally {
    db.close();
  }
}

function verifyLocalUser(email, password) {
  const db = openExistingDatabase();
  try {
    const row = db.prepare(`
      select
        u.id,
        u.email,
        u.nombre,
        u.rol,
        u.activo,
        a.password_salt,
        a.password_hash
      from usuarios_app u
      join local_auth_users a on a.user_id = u.id
      where lower(u.email) = lower(?)
      limit 1
    `).get(String(email || "").trim());

    if (!row || Number(row.activo) !== 1) return null;
    const expected = Buffer.from(row.password_hash, "hex");
    const actual = Buffer.from(hashPassword(password, row.password_salt), "hex");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

    return {
      id: row.id,
      email: row.email,
      nombre: row.nombre || row.email,
      rol: row.rol,
      source: "local"
    };
  } finally {
    db.close();
  }
}

function randomId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSqlBool(value) {
  return value ? 1 : 0;
}

function normalizeImportValue(column, value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (BOOLEAN_COLUMNS.has(column)) return value === true || value === 1 || value === "1" ? 1 : 0;
  if (JSON_COLUMNS.has(column) || Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return value;
}

function deserializeRow(row) {
  if (!row) return row;
  const parsed = { ...row };
  JSON_COLUMNS.forEach((column) => {
    if (!Object.prototype.hasOwnProperty.call(parsed, column)) return;
    if (parsed[column] == null || typeof parsed[column] !== "string") return;
    try {
      parsed[column] = JSON.parse(parsed[column]);
    } catch (error) {
      parsed[column] = column === "validations" ? [] : {};
    }
  });
  return parsed;
}

function deserializeRows(rows = []) {
  return rows.map(deserializeRow);
}

function getTableColumns(db, table) {
  return db.prepare(`pragma table_info(${table})`).all().map((column) => column.name);
}

function findImportConflict(db, table, columns, row) {
  const candidates = IMPORT_CONFLICT_KEYS[table] || [];
  for (const keys of candidates) {
    if (!keys.every((key) => columns.includes(key) && row[key] != null)) continue;
    const where = keys.map((key) => `${key} = ?`).join(" and ");
    const values = keys.map((key) => normalizeImportValue(key, row[key]));
    const existing = db.prepare(`select id from ${table} where ${where} limit 1`).get(...values);
    if (existing) return existing;
  }
  return null;
}

function upsertImportedRow(db, table, columns, row) {
  if (!row?.id) return { skipped: true, reason: "sin id" };
  const filteredColumns = columns.filter((column) => Object.prototype.hasOwnProperty.call(row, column));
  if (!filteredColumns.includes("id")) filteredColumns.unshift("id");
  const values = filteredColumns.map((column) => normalizeImportValue(column, row[column]));
  const existingById = db.prepare(`select id from ${table} where id = ?`).get(row.id);
  const existingByUnique = existingById ? null : findImportConflict(db, table, columns, row);
  const existing = existingById || existingByUnique;

  if (existing) {
    const updateColumns = filteredColumns.filter((column) => column !== "id");
    if (!updateColumns.length) return { updated: true };
    const assignments = updateColumns.map((column) => `${column} = ?`).join(", ");
    const updateValues = updateColumns.map((column) => normalizeImportValue(column, row[column]));
    db.prepare(`update ${table} set ${assignments} where id = ?`).run(...updateValues, existing.id);
    return { updated: true, duplicate: Boolean(existingByUnique) };
  }

  const placeholders = filteredColumns.map(() => "?").join(", ");
  db.prepare(`insert into ${table} (${filteredColumns.join(", ")}) values (${placeholders})`).run(...values);
  return { inserted: true };
}

function importRowsIntoTable(table, rows = []) {
  const db = openExistingDatabase();
  try {
    const columns = getTableColumns(db, table);
    if (!columns.length) throw new Error(`Tabla local no existe: ${table}`);
    const summary = {
      table,
      fetched: rows.length,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      skipped: 0,
      errors: []
    };

    rows.forEach((row) => {
      try {
        const result = upsertImportedRow(db, table, columns, row);
        if (result.inserted) summary.inserted += 1;
        else if (result.updated) {
          summary.updated += 1;
          if (result.duplicate) summary.duplicates += 1;
        }
        else summary.skipped += 1;
      } catch (error) {
        summary.skipped += 1;
        summary.errors.push({
          id: row?.id || null,
          message: error.message
        });
      }
    });

    return summary;
  } finally {
    db.close();
  }
}

function buildWhere(filters = []) {
  const clauses = [];
  const values = [];
  filters.forEach((filter) => {
    const column = filter.column;
    if (!/^[a-zA-Z0-9_]+$/.test(column)) throw new Error(`Filtro invalido: ${column}`);
    if (filter.op === "eq") {
      clauses.push(`${column} = ?`);
      values.push(filter.value);
    } else if (filter.op === "neq") {
      clauses.push(`${column} <> ?`);
      values.push(filter.value);
    } else if (filter.op === "gt") {
      clauses.push(`${column} > ?`);
      values.push(filter.value);
    } else if (filter.op === "is") {
      clauses.push(filter.value === null ? `${column} is null` : `${column} is ?`);
      if (filter.value !== null) values.push(filter.value);
    } else if (filter.op === "in") {
      const list = Array.isArray(filter.value) ? filter.value : [];
      if (!list.length) clauses.push("1 = 0");
      else {
        clauses.push(`${column} in (${list.map(() => "?").join(", ")})`);
        values.push(...list);
      }
    }
  });
  return {
    sql: clauses.length ? ` where ${clauses.join(" and ")}` : "",
    values
  };
}

function selectRows(db, table, options = {}) {
  assertAllowedTable(table, false);
  const where = buildWhere(options.filters || []);
  const order = (options.orders || [])
    .filter((item) => /^[a-zA-Z0-9_]+$/.test(item.column))
    .map((item) => `${item.column} ${item.ascending === false ? "desc" : "asc"}`)
    .join(", ");
  const limit = Number(options.limit || 0);
  const sql = [
    `select * from ${table}`,
    where.sql,
    order ? ` order by ${order}` : "",
    limit > 0 ? ` limit ${Math.min(limit, 10000)}` : ""
  ].join("");
  return deserializeRows(db.prepare(sql).all(...where.values));
}

function filterPayloadColumns(columns, payload = {}) {
  const result = {};
  columns.forEach((column) => {
    if (Object.prototype.hasOwnProperty.call(payload, column)) {
      result[column] = normalizeImportValue(column, payload[column]);
    }
  });
  return result;
}

function insertGenericRow(db, table, columns, payload = {}) {
  const row = filterPayloadColumns(columns, payload);
  if (columns.includes("id") && !row.id) row.id = randomId();
  const keys = Object.keys(row);
  if (!keys.length) throw new Error("Fila sin columnas validas.");
  db.prepare(`insert into ${table} (${keys.join(", ")}) values (${keys.map(() => "?").join(", ")})`)
    .run(...keys.map((key) => row[key]));
  return row.id ? deserializeRow(db.prepare(`select * from ${table} where id = ?`).get(row.id)) : deserializeRow(row);
}

function findConflictRow(db, table, columns, payload, conflictColumns = []) {
  const validConflictColumns = conflictColumns.filter((column) => columns.includes(column));
  if (!validConflictColumns.length) return null;
  const where = validConflictColumns.map((column) => `${column} = ?`).join(" and ");
  const values = validConflictColumns.map((column) => payload[column]);
  if (values.some((value) => value == null)) return null;
  return db.prepare(`select * from ${table} where ${where} limit 1`).get(...values);
}

function queryLocalTable(table, options = {}) {
  const operation = options.operation || "select";
  assertAllowedTable(table, operation !== "select");
  const db = openExistingDatabase();
  try {
    const columns = getTableColumns(db, table);
    if (!columns.length && !SELECT_ONLY_TABLES.has(table)) throw new Error(`Tabla local no existe: ${table}`);
    let rows = [];

    if (operation === "select") {
      rows = selectRows(db, table, options);
    } else if (operation === "insert") {
      const payloads = Array.isArray(options.payload) ? options.payload : [options.payload || {}];
      db.exec("BEGIN;");
      try {
        rows = payloads.map((payload) => insertGenericRow(db, table, columns, payload));
        db.exec("COMMIT;");
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
    } else if (operation === "upsert") {
      const payloads = Array.isArray(options.payload) ? options.payload : [options.payload || {}];
      const conflictColumns = String(options.onConflict || "").split(",").map((item) => item.trim()).filter(Boolean);
      db.exec("BEGIN;");
      try {
        rows = payloads.map((payload) => {
          const normalizedPayload = filterPayloadColumns(columns, payload);
          const existing = normalizedPayload.id
            ? db.prepare(`select * from ${table} where id = ?`).get(normalizedPayload.id)
            : findConflictRow(db, table, columns, normalizedPayload, conflictColumns);
          if (!existing) return insertGenericRow(db, table, columns, normalizedPayload);
          const keys = Object.keys(normalizedPayload).filter((key) => key !== "id");
          if (keys.length) {
            db.prepare(`update ${table} set ${keys.map((key) => `${key} = ?`).join(", ")} where id = ?`)
              .run(...keys.map((key) => normalizedPayload[key]), existing.id);
          }
          return deserializeRow(db.prepare(`select * from ${table} where id = ?`).get(existing.id));
        });
        db.exec("COMMIT;");
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
    } else if (operation === "update") {
      const where = buildWhere(options.filters || []);
      const payload = filterPayloadColumns(columns, options.payload || {});
      const keys = Object.keys(payload).filter((key) => key !== "id");
      if (keys.length) {
        const before = db.prepare(`select id from ${table}${where.sql}`).all(...where.values).map((row) => row.id);
        db.prepare(`update ${table} set ${keys.map((key) => `${key} = ?`).join(", ")}${where.sql}`)
          .run(...keys.map((key) => payload[key]), ...where.values);
        rows = before.length
          ? deserializeRows(db.prepare(`select * from ${table} where id in (${before.map(() => "?").join(", ")})`).all(...before))
          : [];
      }
    } else if (operation === "delete") {
      const where = buildWhere(options.filters || []);
      const before = db.prepare(`select id from ${table}${where.sql}`).all(...where.values).map((row) => row.id);
      db.prepare(`delete from ${table}${where.sql}`).run(...where.values);
      rows = before.map((id) => ({ id }));
    } else {
      throw new Error(`Operacion local no soportada: ${operation}`);
    }

    let data = rows;
    if (options.single) data = rows[0] || null;
    if (options.maybeSingle) data = rows[0] || null;
    return { data, count: Array.isArray(rows) ? rows.length : data ? 1 : 0 };
  } finally {
    db.close();
  }
}

function normalizeProductLinkCode(value) {
  return String(value || "").replace(/\s+/g, "").trim().toUpperCase();
}

function mapProductCodeLink(row) {
  const parsed = deserializeRow(row);
  if (!parsed) return null;
  return {
    ...parsed,
    detected_quantity: parsed.detected_quantity == null ? null : Number(parsed.detected_quantity),
    package_quantity: parsed.package_quantity == null ? null : Number(parsed.package_quantity),
    conversion_factor: parsed.conversion_factor == null ? null : Number(parsed.conversion_factor),
    confidence: Number(parsed.confidence || 0),
    scan_count: Number(parsed.scan_count || 0),
    is_active: Number(parsed.is_active) === 1
  };
}

function listProductCodeLinks({ activeOnly = true } = {}) {
  const db = openExistingDatabase();
  try {
    const rows = activeOnly
      ? db.prepare("select * from product_code_links where is_active = 1 order by updated_at desc").all()
      : db.prepare("select * from product_code_links order by updated_at desc").all();
    return rows.map(mapProductCodeLink);
  } finally {
    db.close();
  }
}

function getProductCodeLinkByCode(codeNormalized) {
  const normalized = normalizeProductLinkCode(codeNormalized);
  if (!normalized) return null;
  const db = openExistingDatabase();
  try {
    const row = db.prepare("select * from product_code_links where code_normalized = ? limit 1").get(normalized);
    return mapProductCodeLink(row);
  } finally {
    db.close();
  }
}

function upsertProductCodeLink(payload = {}, userId = null) {
  const productId = payload.product_id || payload.productId;
  const codeRaw = String(payload.code_raw || payload.codeRaw || payload.gtin || "").trim();
  const codeNormalized = normalizeProductLinkCode(payload.code_normalized || payload.codeNormalized || payload.gtin || codeRaw);
  if (!productId) throw new Error("Selecciona un producto para aprender el codigo.");
  if (!codeNormalized) throw new Error("No hay codigo detectado para aprender.");

  const db = openExistingDatabase();
  try {
    const product = db.prepare("select id from productos_insumos where id = ? and deleted_at is null limit 1").get(productId);
    if (!product) throw new Error("Producto de inventario no encontrado.");

    const currentTime = now();
    const gs1Payload = payload.gs1_payload_json ?? payload.gs1PayloadJson ?? payload.gs1Payload ?? null;
    const gs1PayloadJson = typeof gs1Payload === "string"
      ? gs1Payload
      : normalizeImportValue("gs1_payload_json", gs1Payload);
    const normalizedPayload = {
      product_id: productId,
      code_raw: codeRaw || codeNormalized,
      code_normalized: codeNormalized,
      code_type: payload.code_type || payload.codeType || null,
      gtin: payload.gtin || null,
      barcode_format: payload.barcode_format || payload.barcodeFormat || null,
      gs1_payload_json: gs1PayloadJson,
      detected_lot: payload.detected_lot || payload.detectedLot || null,
      detected_expiry: payload.detected_expiry || payload.detectedExpiry || null,
      detected_mfg_date: payload.detected_mfg_date || payload.detectedMfgDate || null,
      detected_quantity: payload.detected_quantity ?? payload.detectedQuantity ?? null,
      package_type: payload.package_type || payload.packageType || null,
      package_quantity: payload.package_quantity ?? payload.packageQuantity ?? null,
      package_unit: payload.package_unit || payload.packageUnit || null,
      base_unit: payload.base_unit || payload.baseUnit || null,
      conversion_factor: payload.conversion_factor ?? payload.conversionFactor ?? null,
      conversion_notes: payload.conversion_notes || payload.conversionNotes || null,
      source: payload.source || "camera_learning",
      confidence: Number(payload.confidence || 0),
      created_by: payload.created_by || payload.createdBy || userId || null
    };

    db.exec("BEGIN;");
    try {
      const existing = db.prepare("select * from product_code_links where code_normalized = ? limit 1")
        .get(codeNormalized);
      let id;
      if (existing) {
        id = existing.id;
        db.prepare(`
          update product_code_links set
            product_id = ?,
            code_raw = ?,
            code_type = ?,
            gtin = ?,
            barcode_format = ?,
            gs1_payload_json = ?,
            detected_lot = ?,
            detected_expiry = ?,
            detected_mfg_date = ?,
            detected_quantity = ?,
            package_type = ?,
            package_quantity = ?,
            package_unit = ?,
            base_unit = ?,
            conversion_factor = ?,
            conversion_notes = ?,
            source = ?,
            confidence = ?,
            created_by = coalesce(?, created_by),
            last_seen_at = ?,
            scan_count = coalesce(scan_count, 0) + 1,
            is_active = 1
          where id = ?
        `).run(
          normalizedPayload.product_id,
          normalizedPayload.code_raw,
          normalizedPayload.code_type,
          normalizedPayload.gtin,
          normalizedPayload.barcode_format,
          normalizedPayload.gs1_payload_json,
          normalizedPayload.detected_lot,
          normalizedPayload.detected_expiry,
          normalizedPayload.detected_mfg_date,
          normalizedPayload.detected_quantity,
          normalizedPayload.package_type,
          normalizedPayload.package_quantity,
          normalizedPayload.package_unit,
          normalizedPayload.base_unit,
          normalizedPayload.conversion_factor,
          normalizedPayload.conversion_notes,
          normalizedPayload.source,
          normalizedPayload.confidence,
          normalizedPayload.created_by,
          currentTime,
          id
        );
      } else {
        id = payload.id || randomId();
        db.prepare(`
          insert into product_code_links (
            id,
            product_id,
            code_raw,
            code_normalized,
            code_type,
            gtin,
            barcode_format,
            gs1_payload_json,
            detected_lot,
            detected_expiry,
            detected_mfg_date,
            detected_quantity,
            package_type,
            package_quantity,
            package_unit,
            base_unit,
            conversion_factor,
            conversion_notes,
            source,
            confidence,
            created_by,
            created_at,
            updated_at,
            last_seen_at,
            scan_count,
            is_active
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
        `).run(
          id,
          normalizedPayload.product_id,
          normalizedPayload.code_raw,
          normalizedPayload.code_normalized,
          normalizedPayload.code_type,
          normalizedPayload.gtin,
          normalizedPayload.barcode_format,
          normalizedPayload.gs1_payload_json,
          normalizedPayload.detected_lot,
          normalizedPayload.detected_expiry,
          normalizedPayload.detected_mfg_date,
          normalizedPayload.detected_quantity,
          normalizedPayload.package_type,
          normalizedPayload.package_quantity,
          normalizedPayload.package_unit,
          normalizedPayload.base_unit,
          normalizedPayload.conversion_factor,
          normalizedPayload.conversion_notes,
          normalizedPayload.source,
          normalizedPayload.confidence,
          normalizedPayload.created_by,
          currentTime,
          currentTime,
          currentTime
        );
      }
      const saved = db.prepare("select * from product_code_links where id = ?").get(id);
      db.exec("COMMIT;");
      return mapProductCodeLink(saved);
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  } finally {
    db.close();
  }
}

function findOrCreateProduct(db, payload = {}) {
  const normalizedName = payload.nombreNormalizado || payload.nombre_normalizado || normalizeName(payload.nombre);
  if (!payload.nombre || !normalizedName) throw new Error("El nombre del producto es obligatorio.");

  let product = db.prepare(`
    select id, nombre, nombre_normalizado, unidad_default, stock_minimo, critico,
           consumo_promedio_diario, favorito, activo
    from productos_insumos
    where nombre_normalizado = ? and deleted_at is null
    limit 1
  `).get(normalizedName);

  if (product) {
    if (payload.critico && Number(product.critico) !== 1) {
      db.prepare("update productos_insumos set critico = 1, updated_at = ? where id = ?").run(now(), product.id);
      product = { ...product, critico: 1 };
    }
    return product;
  }

  const id = randomId();
  db.prepare(`
    insert into productos_insumos (
      id, nombre, nombre_normalizado, unidad_default, stock_minimo,
      critico, consumo_promedio_diario, favorito, activo, created_at, updated_at
    ) values (?, ?, ?, ?, 0, ?, 0, 0, 1, ?, ?)
  `).run(
    id,
    String(payload.nombre || "").trim(),
    normalizedName,
    payload.unidad || payload.unidad_default || "kg",
    toSqlBool(payload.critico),
    now(),
    now()
  );

  return db.prepare(`
    select id, nombre, nombre_normalizado, unidad_default, stock_minimo, critico,
           consumo_promedio_diario, favorito, activo
    from productos_insumos
    where id = ?
  `).get(id);
}

function createInventoryEntry(payload = {}, userId = null) {
  const db = openExistingDatabase();
  try {
    db.exec("BEGIN;");
    const product = findOrCreateProduct(db, payload);
    const lotId = randomId();
    const timestamp = now();

    db.prepare(`
      insert into insumo_lotes (
        id, producto_id, fecha_recepcion, fecha_vencimiento, lote, unidad,
        observaciones, alerta_vencimiento_revisada, activo, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
    `).run(
      lotId,
      product.id,
      payload.fechaRecepcion || payload.fecha_recepcion || new Date().toISOString().slice(0, 10),
      payload.fechaVencimiento || payload.fecha_vencimiento || null,
      payload.lote || null,
      payload.unidad || product.unidad_default || "kg",
      payload.observaciones || null,
      timestamp,
      timestamp
    );

    db.prepare(`
      insert into movimientos_inventario (
        id, producto_id, lote_id, tipo_movimiento, cantidad, unidad,
        usuario_id, motivo, observacion, created_at
      ) values (?, ?, ?, 'ingreso', ?, ?, ?, ?, ?, ?)
    `).run(
      randomId(),
      product.id,
      lotId,
      Number(payload.cantidad || 0),
      payload.unidad || product.unidad_default || "kg",
      userId,
      payload.motivo || "Ingreso desde backend local",
      payload.observaciones || null,
      timestamp
    );

    db.exec("COMMIT;");
    return { ok: true, productId: product.id, lotId };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.close();
  }
}

function updateInventoryEntry(payload = {}, userId = null) {
  const db = openExistingDatabase();
  try {
    db.exec("BEGIN;");
    const lotId = payload.loteId || payload.lote_id;
    const productId = payload.productoId || payload.producto_id;
    if (!lotId || !productId) throw new Error("Falta lote o producto para editar.");

    const currentProduct = db.prepare("select * from productos_insumos where id = ?").get(productId);
    if (!currentProduct) throw new Error("Producto no encontrado.");

    const nombre = String(payload.nombre || currentProduct.nombre || "").trim();
    const nombreNormalizado = payload.nombreNormalizado || normalizeName(nombre);
    const duplicated = db.prepare(`
      select id, nombre from productos_insumos
      where nombre_normalizado = ? and id <> ? and deleted_at is null
      limit 1
    `).get(nombreNormalizado, productId);
    if (duplicated) throw new Error(`Ya existe un producto llamado "${duplicated.nombre}".`);

    db.prepare(`
      update productos_insumos
      set nombre = ?, nombre_normalizado = ?, unidad_default = ?, updated_at = ?
      where id = ?
    `).run(nombre, nombreNormalizado, payload.unidad || currentProduct.unidad_default || "kg", now(), productId);

    db.prepare(`
      update insumo_lotes
      set fecha_recepcion = ?, fecha_vencimiento = ?, lote = ?, unidad = ?, observaciones = ?, updated_at = ?
      where id = ?
    `).run(
      payload.fechaRecepcion || payload.fecha_recepcion || new Date().toISOString().slice(0, 10),
      payload.fechaVencimiento || payload.fecha_vencimiento || null,
      payload.lote || null,
      payload.unidad || currentProduct.unidad_default || "kg",
      payload.observaciones || null,
      now(),
      lotId
    );

    const currentQuantity = Number(payload.currentQuantity ?? payload.cantidad_actual ?? 0);
    const nextQuantity = Number(payload.nextQuantity ?? payload.cantidad ?? 0);
    const delta = Number((nextQuantity - currentQuantity).toFixed(3));
    if (delta !== 0) {
      db.prepare(`
        insert into movimientos_inventario (
          id, producto_id, lote_id, tipo_movimiento, cantidad, unidad,
          usuario_id, motivo, observacion, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomId(),
        productId,
        lotId,
        delta > 0 ? "ingreso" : "eliminacion",
        Math.abs(delta),
        payload.unidad || currentProduct.unidad_default || "kg",
        userId,
        "Ajuste manual desde edicion local",
        payload.observaciones || null,
        now()
      );
    }

    db.exec("COMMIT;");
    return { ok: true };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.close();
  }
}

function insertMovements(movements = [], userId = null) {
  const db = openExistingDatabase();
  try {
    db.exec("BEGIN;");
    const stmt = db.prepare(`
      insert into movimientos_inventario (
        id, producto_id, lote_id, tipo_movimiento, cantidad, unidad,
        fecha_movimiento, usuario_id, motivo, observacion, desviacion_fifo,
        lote_recomendado_id, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    movements.forEach((movement) => {
      stmt.run(
        randomId(),
        movement.producto_id || movement.productoId,
        movement.lote_id || movement.loteId || null,
        movement.tipo_movimiento || movement.tipo,
        Number(movement.cantidad || 0),
        movement.unidad || "kg",
        movement.fecha_movimiento || now(),
        movement.usuario_id || userId,
        movement.motivo || null,
        movement.observacion || null,
        toSqlBool(movement.desviacion_fifo),
        movement.lote_recomendado_id || movement.loteRecomendadoId || null,
        now()
      );
    });
    db.exec("COMMIT;");
    return { ok: true, count: movements.length };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.close();
  }
}

function deleteInventoryLot(lotId, userId = null) {
  const db = openExistingDatabase();
  try {
    db.exec("BEGIN;");
    const item = db.prepare("select * from inventario_lotes_disponibles where lote_id = ?").get(lotId);
    if (!item) throw new Error("Lote no encontrado.");
    if (Number(item.cantidad_disponible || 0) > 0) {
      db.prepare(`
        insert into movimientos_inventario (
          id, producto_id, lote_id, tipo_movimiento, cantidad, unidad,
          usuario_id, motivo, observacion, created_at
        ) values (?, ?, ?, 'eliminacion', ?, ?, ?, ?, ?, ?)
      `).run(
        randomId(),
        item.producto_id,
        item.lote_id,
        Number(item.cantidad_disponible || 0),
        item.unidad || "kg",
        userId,
        "Eliminacion logica desde inventario local",
        item.observaciones || null,
        now()
      );
    }
    db.prepare("update insumo_lotes set activo = 0, deleted_at = ?, deleted_by = ?, updated_at = ? where id = ?")
      .run(now(), userId, now(), lotId);
    db.exec("COMMIT;");
    return { ok: true };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.close();
  }
}

function updateLot(lotId, fields = {}) {
  const db = openExistingDatabase();
  try {
    const allowed = {
      alerta_vencimiento_revisada: "alerta_vencimiento_revisada",
      cantidad_por_caja: "cantidad_por_caja"
    };
    const updates = [];
    const values = [];
    Object.entries(allowed).forEach(([key, column]) => {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        updates.push(`${column} = ?`);
        values.push(key === "alerta_vencimiento_revisada" ? toSqlBool(fields[key]) : fields[key]);
      }
    });
    if (!updates.length) return { ok: true };
    updates.push("updated_at = ?");
    values.push(now(), lotId);
    db.prepare(`update insumo_lotes set ${updates.join(", ")} where id = ?`).run(...values);
    return { ok: true };
  } finally {
    db.close();
  }
}

function updateProduct(productId, fields = {}) {
  const db = openExistingDatabase();
  try {
    const allowed = {
      stock_minimo: "stock_minimo",
      unidad_default: "unidad_default",
      consumo_promedio_diario: "consumo_promedio_diario",
      critico: "critico",
      activo: "activo"
    };
    const updates = [];
    const values = [];
    Object.entries(allowed).forEach(([key, column]) => {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        updates.push(`${column} = ?`);
        values.push(["critico", "activo"].includes(key) ? toSqlBool(fields[key]) : fields[key]);
      }
    });
    if (!updates.length) return { ok: true };
    updates.push("updated_at = ?");
    values.push(now(), productId);
    db.prepare(`update productos_insumos set ${updates.join(", ")} where id = ?`).run(...values);
    return { ok: true };
  } finally {
    db.close();
  }
}

function listDailyTasks() {
  const db = openExistingDatabase();
  try {
    return db.prepare(`
      select *
      from daily_tasks
      order by
        case when scheduled_time is null or scheduled_time = '' then 1 else 0 end,
        scheduled_time asc,
        created_at asc
    `).all();
  } finally {
    db.close();
  }
}

function saveDailyTask(payload = {}, userId = null) {
  const db = openExistingDatabase();
  try {
    const id = payload.id && !String(payload.id).startsWith("local-") ? payload.id : randomId();
    const existing = db.prepare("select id from daily_tasks where id = ?").get(id);
    const row = {
      id,
      title: payload.title || "",
      description: payload.description || null,
      scheduled_time: payload.scheduled_time || null,
      due_date: payload.due_date || null,
      recurrence_type: payload.recurrence_type || "diaria",
      priority: payload.priority || "media",
      assigned_to: payload.assigned_to || "equipo",
      status: payload.status || "pendiente",
      notes: payload.notes || null,
      created_by: payload.created_by || userId || null,
      completed_at: payload.completed_at || null
    };
    if (!row.title) throw new Error("El titulo de la tarea es obligatorio.");

    if (existing) {
      db.prepare(`
        update daily_tasks
        set title = ?, description = ?, scheduled_time = ?, due_date = ?, recurrence_type = ?,
            priority = ?, assigned_to = ?, status = ?, notes = ?, updated_at = ?, completed_at = ?
        where id = ?
      `).run(
        row.title,
        row.description,
        row.scheduled_time,
        row.due_date,
        row.recurrence_type,
        row.priority,
        row.assigned_to,
        row.status,
        row.notes,
        now(),
        row.completed_at,
        id
      );
    } else {
      db.prepare(`
        insert into daily_tasks (
          id, title, description, scheduled_time, due_date, recurrence_type, priority,
          assigned_to, status, notes, created_by, created_at, updated_at, completed_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        row.title,
        row.description,
        row.scheduled_time,
        row.due_date,
        row.recurrence_type,
        row.priority,
        row.assigned_to,
        row.status,
        row.notes,
        row.created_by,
        now(),
        now(),
        row.completed_at
      );
    }

    return db.prepare("select * from daily_tasks where id = ?").get(id);
  } finally {
    db.close();
  }
}

function updateDailyTask(taskId, fields = {}) {
  return saveDailyTask({ ...fields, id: taskId }, fields.created_by || null);
}

function createPendingEntry(payload = {}, details = []) {
  const db = openExistingDatabase();
  try {
    db.exec("BEGIN;");
    const pendingId = payload.id || randomId();
    db.prepare(`
      insert into ingresos_pendientes (
        id, creado_por, creado_por_email, creado_por_nombre, estado,
        fecha_recepcion, observacion_general, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        creado_por = excluded.creado_por,
        creado_por_email = excluded.creado_por_email,
        creado_por_nombre = excluded.creado_por_nombre,
        estado = excluded.estado,
        fecha_recepcion = excluded.fecha_recepcion,
        observacion_general = excluded.observacion_general,
        updated_at = excluded.updated_at
    `).run(
      pendingId,
      payload.creado_por || null,
      payload.creado_por_email || null,
      payload.creado_por_nombre || null,
      payload.estado || "pendiente",
      payload.fecha_recepcion || new Date().toISOString().slice(0, 10),
      payload.observacion_general || null,
      now(),
      now()
    );

    const stmt = db.prepare(`
      insert into ingresos_pendientes_detalle (
        id, ingreso_pendiente_id, nombre, nombre_normalizado, cantidad, unidad,
        fecha_vencimiento, lote, critico, observaciones, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        nombre = excluded.nombre,
        nombre_normalizado = excluded.nombre_normalizado,
        cantidad = excluded.cantidad,
        unidad = excluded.unidad,
        fecha_vencimiento = excluded.fecha_vencimiento,
        lote = excluded.lote,
        critico = excluded.critico,
        observaciones = excluded.observaciones
    `);
    details.forEach((detail) => {
      stmt.run(
        detail.id || randomId(),
        pendingId,
        detail.nombre,
        detail.nombre_normalizado || normalizeName(detail.nombre),
        Number(detail.cantidad || 0),
        detail.unidad || "kg",
        detail.fecha_vencimiento || null,
        detail.lote || null,
        toSqlBool(detail.critico),
        detail.observaciones || null,
        now()
      );
    });

    db.exec("COMMIT;");
    return { ok: true, id: pendingId };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.close();
  }
}

function listPendingEntries(scope = "operator", userId = null) {
  const db = openExistingDatabase();
  try {
    const entries = scope === "operator" && userId
      ? db.prepare("select * from ingresos_pendientes where creado_por = ? order by created_at desc").all(userId)
      : db.prepare("select * from ingresos_pendientes order by created_at desc").all();
    const ids = entries.map((entry) => entry.id);
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const details = db.prepare(`
      select *
      from ingresos_pendientes_detalle
      where ingreso_pendiente_id in (${placeholders})
      order by created_at asc
    `).all(...ids);
    return entries.map((entry) => ({
      ...entry,
      detalles: details.filter((detail) => detail.ingreso_pendiente_id === entry.id)
    }));
  } finally {
    db.close();
  }
}

function updatePendingEntry(entryId, fields = {}) {
  const db = openExistingDatabase();
  try {
    const allowed = {
      estado: "estado",
      aprobado_por: "aprobado_por",
      aprobado_por_email: "aprobado_por_email",
      aprobado_at: "aprobado_at",
      rechazado_por: "rechazado_por",
      rechazado_por_email: "rechazado_por_email",
      rechazado_at: "rechazado_at",
      motivo_rechazo: "motivo_rechazo"
    };
    const updates = [];
    const values = [];
    Object.entries(allowed).forEach(([key, column]) => {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        updates.push(`${column} = ?`);
        values.push(fields[key]);
      }
    });
    if (!updates.length) return { ok: true };
    updates.push("updated_at = ?");
    values.push(now(), entryId);
    db.prepare(`update ingresos_pendientes set ${updates.join(", ")} where id = ?`).run(...values);
    return { ok: true };
  } finally {
    db.close();
  }
}

function getInventorySnapshot() {
  const db = openExistingDatabase();
  try {
    const products = db.prepare(`
      select id, nombre, nombre_normalizado, unidad_default, stock_minimo, critico,
             consumo_promedio_diario, favorito, activo
      from productos_insumos
      where activo = 1 and deleted_at is null
      order by nombre asc
    `).all();

    const inventory = db.prepare(`
      select *
      from inventario_lotes_disponibles
      where cantidad_disponible > 0 and activo = 1 and deleted_at is null
      order by
        case when fecha_vencimiento is null then 1 else 0 end,
        fecha_vencimiento asc
    `).all();

    const lowStock = db.prepare("select * from alertas_stock_minimo order by nombre asc").all();

    const movements = db.prepare(`
      select *
      from historial_movimientos_inventario
      order by fecha_movimiento desc, created_at desc
      limit 300
    `).all();

    return {
      products,
      inventory,
      lowStock,
      movements
    };
  } finally {
    db.close();
  }
}

function createBackup() {
  if (!fs.existsSync(DB_PATH)) {
    const error = new Error("No existe base local para respaldar.");
    error.code = "LOCAL_DB_PENDING";
    throw error;
  }

  ensureDirs();
  const db = openExistingDatabase();
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    db.close();
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `jesunutri-local-${stamp}.sqlite`);
  fs.copyFileSync(DB_PATH, backupPath);
  return {
    ok: true,
    backupPath,
    databasePath: DB_PATH,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  DB_PATH,
  IMPORT_TABLES,
  createBackup,
  createPendingEntry,
  createInventoryEntry,
  deleteInventoryLot,
  findOrCreateProduct,
  getInventorySnapshot,
  getProductCodeLinkByCode,
  getStatus,
  ensureLocalAdminIfNoUsers,
  importRowsIntoTable,
  insertMovements,
  installDatabase,
  listDailyTasks,
  listPendingEntries,
  listProductCodeLinks,
  queryLocalTable,
  saveDailyTask,
  removeLocalAdminSeedIfPresent,
  upsertProductCodeLink,
  updateDailyTask,
  updateInventoryEntry,
  updateLot,
  updatePendingEntry,
  updateProduct,
  verifyLocalUser
};
