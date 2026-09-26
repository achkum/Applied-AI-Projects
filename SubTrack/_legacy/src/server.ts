import { createServer } from "node:http";
const port = Number(process.env.PORT ?? 3000);
const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "subtrack" })); return;
  }
  response.writeHead(404, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "not_found" }));
});
server.listen(port, () => console.log(`SubTrack listening on ${port}`));
