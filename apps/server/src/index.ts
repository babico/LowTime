import { buildApp, parsePort } from "./app.js";

const port = parsePort(process.env.PORT);
const host = process.env.HOST ?? "0.0.0.0";
const app = buildApp();

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`server listening on ${host}:${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
