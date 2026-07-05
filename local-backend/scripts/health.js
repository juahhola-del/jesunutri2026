const http = require("http");
const { HOST, PORT } = require("../config");

const request = http.get(`http://${HOST}:${PORT}/api/health`, (response) => {
  let body = "";
  response.on("data", (chunk) => {
    body += chunk;
  });
  response.on("end", () => {
    console.log(body);
    process.exit(response.statusCode === 200 ? 0 : 1);
  });
});

request.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

request.setTimeout(3000, () => {
  request.destroy(new Error("Timeout consultando backend local."));
});
