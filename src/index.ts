import app from './app';
import { env } from './config/env';

app.listen(env.PORT, () => {
  console.log(`[SERVER] http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
