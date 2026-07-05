const fs = require("node:fs");
const vm = require("node:vm");

const scriptSource = fs.readFileSync("script.js", "utf8");

function extractBlock(startMarker, endMarker) {
  const start = scriptSource.indexOf(startMarker);
  const end = scriptSource.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`No se pudo extraer bloque ${startMarker}`);
  }
  return scriptSource.slice(start, end);
}

function extractFunction(name) {
  const start = scriptSource.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`No se encontro ${name}`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < scriptSource.length; index += 1) {
    const char = scriptSource[index];
    if (char === "{") {
      depth += 1;
      opened = true;
    } else if (char === "}") {
      depth -= 1;
      if (opened && depth === 0) return scriptSource.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo cerrar ${name}`);
}

const scannerSource = extractBlock("function normalizeScanCode", "function formatScanConfidence");
const quantitySource = extractFunction("getScanQuantitySuggestion");

const sandbox = {
  module: { exports: {} },
  console,
  state: {
    productCodeLinks: [],
    products: [],
    inventory: [],
    productCodes: {}
  },
  CLINICAL_MONTH_NAME_ALIASES: {
    ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
    may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
    sep: 8, sept: 8, setiembre: 8, septiembre: 8, oct: 9, octubre: 9,
    nov: 10, noviembre: 10, dic: 11, diciembre: 11
  },
  UNIT_OPTIONS: ["kg", "g", "lt", "ml", "unidad", "caja", "paquete"],
  normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  },
  normalizeLotValue(value) {
    return String(value || "").trim().toUpperCase();
  },
  isValidIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  },
  parseDateInput(value) {
    const raw = String(value || "").trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return raw;
    const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (!dmy) return "";
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return `${year}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
};

vm.createContext(sandbox);
vm.runInContext(
  `${scannerSource}
${quantitySource}
module.exports = {
  parseGs1,
  buildContinuousScanExtraction,
  getScanQuantitySuggestion,
  state
};`,
  sandbox
);

const {
  parseGs1,
  buildContinuousScanExtraction,
  getScanQuantitySuggestion,
  state
} = sandbox.module.exports;

function assert(name, condition, detail = "") {
  return { name, ok: Boolean(condition), detail };
}

const gs1WithParentheses = parseGs1("(01)17802500025633(11)250512(17)270512(10)01L0526");
const gs1Raw = parseGs1("013780250011292411260120173001191003LO126");
const simpleDun = buildContinuousScanExtraction({
  barcode: {
    rawValue: "17802500025633",
    format: "itf",
    engine: "BarcodeDetector",
    confidence: 0.95
  }
});

state.products = [{
  id: "prod-semola",
  nombre: "Semola LUCCHETTI Fardo 500g",
  unidad_default: "unidad"
}];
state.productCodeLinks = [{
  id: "link-semola-caja",
  productId: "prod-semola",
  codeRaw: "17802500025633",
  codeNormalized: "17802500025633",
  gtin: "17802500025633",
  packageType: "caja",
  packageQuantity: 24,
  packageUnit: "unidad",
  baseUnit: "unidad",
  conversionFactor: 24,
  scanCount: 2,
  isActive: true,
  source: "camera_learning"
}];

const linkedExtraction = buildContinuousScanExtraction({
  barcode: {
    rawValue: "17802500025633",
    format: "itf",
    engine: "ZXing",
    confidence: 0.95
  }
});
const linkedQuantity = getScanQuantitySuggestion(linkedExtraction);

state.productCodeLinks = [];
state.products = [];
const unlinkedExtraction = buildContinuousScanExtraction({
  barcode: {
    rawValue: "27802576002215",
    format: "itf",
    engine: "BarcodeDetector",
    confidence: 0.9
  }
});
const unlinkedQuantity = getScanQuantitySuggestion(unlinkedExtraction);

const assertions = [
  assert("GS1 parentesis detectado", gs1WithParentheses.isGs1),
  assert("GS1 parentesis GTIN", gs1WithParentheses.fields.gtin === "17802500025633", gs1WithParentheses.fields.gtin),
  assert("GS1 parentesis elaboracion", gs1WithParentheses.fields.productionDate === "2025-05-12", gs1WithParentheses.fields.productionDate),
  assert("GS1 parentesis vencimiento", gs1WithParentheses.fields.expirationDate === "2027-05-12", gs1WithParentheses.fields.expirationDate),
  assert("GS1 parentesis lote", gs1WithParentheses.fields.lot === "01L0526", gs1WithParentheses.fields.lot),
  assert("GS1 crudo detectado", gs1Raw.isGs1),
  assert("GS1 crudo GTIN", gs1Raw.fields.gtin === "37802500112924", gs1Raw.fields.gtin),
  assert("GS1 crudo elaboracion", gs1Raw.fields.productionDate === "2026-01-20", gs1Raw.fields.productionDate),
  assert("GS1 crudo vencimiento", gs1Raw.fields.expirationDate === "2030-01-19", gs1Raw.fields.expirationDate),
  assert("GS1 crudo lote", gs1Raw.fields.lot === "03LO126", gs1Raw.fields.lot),
  assert("DUN simple no es GS1", simpleDun.codeKind === "simple", simpleDun.codeKind),
  assert("DUN simple conserva GTIN completo", simpleDun.fields.gtin.value === "17802500025633", simpleDun.fields.gtin.value),
  assert("Vinculo aprendido sugiere factor", linkedQuantity.quantity === 24, String(linkedQuantity.quantity)),
  assert("Vinculo aprendido unidad base", linkedQuantity.unit === "unidad", linkedQuantity.unit),
  assert("Vinculo aprendido fuente", linkedQuantity.source === "regla_empaque", linkedQuantity.source),
  assert("Codigo no vinculado no asume 1", unlinkedQuantity.quantity === 0, String(unlinkedQuantity.quantity)),
  assert("Codigo no vinculado queda pendiente", unlinkedQuantity.source === "pendiente", unlinkedQuantity.source)
];

const failed = assertions.filter((item) => !item.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  assertions,
  parsedSamples: {
    gs1WithParentheses: gs1WithParentheses.fields,
    gs1Raw: gs1Raw.fields,
    simpleDun: {
      codeKind: simpleDun.codeKind,
      gtin: simpleDun.fields.gtin.value,
      tipoCodigo: simpleDun.fields.tipoCodigo.value
    },
    linkedQuantity,
    unlinkedQuantity
  }
}, null, 2));

if (failed.length) process.exit(1);
