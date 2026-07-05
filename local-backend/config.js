const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath = path.join(__dirname, ".env")) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return;
    const index = clean.indexOf("=");
    if (index <= 0) return;
    const key = clean.slice(0, index).trim();
    let value = clean.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));
loadEnvFile();

const DATA_DIR = path.resolve(process.env.JESUNUTRI_LOCAL_DATA_DIR || path.join(__dirname, "data"));
const BACKUP_DIR = path.resolve(process.env.JESUNUTRI_LOCAL_BACKUP_DIR || path.join(__dirname, "backups"));
const DB_PATH = path.resolve(process.env.JESUNUTRI_LOCAL_DB_PATH || path.join(DATA_DIR, "jesunutri-local.sqlite"));
const PORT = Number(process.env.JESUNUTRI_LOCAL_PORT || 8787);
const HOST = process.env.JESUNUTRI_LOCAL_HOST || "127.0.0.1";

const LOCAL_ADMIN = {
  id: process.env.JESUNUTRI_LOCAL_ADMIN_ID || "local-admin",
  email: process.env.JESUNUTRI_LOCAL_ADMIN_EMAIL || "jesu@nutri.cl",
  nombre: process.env.JESUNUTRI_LOCAL_ADMIN_NAME || "Jesu",
  rol: "admin",
  password: process.env.JESUNUTRI_LOCAL_ADMIN_PASSWORD || "jesu-local"
};

const SUPABASE_IMPORT = {
  url: process.env.SUPABASE_URL || "",
  anonKey: process.env.SUPABASE_ANON_KEY || "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
};

module.exports = {
  DATA_DIR,
  BACKUP_DIR,
  DB_PATH,
  PORT,
  HOST,
  LOCAL_ADMIN,
  SUPABASE_IMPORT
};
