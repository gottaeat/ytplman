import { createApp } from './server.js';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
const server = createApp({ origin: process.env.BASE_URL });
server.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`ytplman: http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 35000).unref();
  });
