import { createApp } from "./app.js";
import { env } from "./lib/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`api listening on port ${env.PORT} (${env.NODE_ENV})`);
});
