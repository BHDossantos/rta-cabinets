import { createApp } from './app';

const port = Number(process.env.PORT ?? 8787);
const { server } = createApp();
server().listen(port, () => {
  console.log(`RTA API listening on http://localhost:${port} (in-memory store, synthetic fixtures)`);
});
