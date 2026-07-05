const { installDatabase } = require("../db");

try {
  const status = installDatabase();
  console.log(JSON.stringify(status, null, 2));
  process.exit(status.installed ? 0 : 1);
} catch (error) {
  console.error(error);
  process.exit(1);
}
