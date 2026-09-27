import { app } from './app.js';
import { env } from './lib/env.js';

app.listen(env.port, () => {
  console.log(`API listening on port ${env.port}`);
});
