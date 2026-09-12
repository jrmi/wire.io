import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { handleWire } from './server.js';

const startServer = ({
  socketIOConfig = {},
  port = 4000,
  corsOptions = { origin: false },
}) => {
  const app = express();
  const http = createServer(app);

  // Cross-origin access is disabled by default. Applications that need it must
  // provide an explicit origin allowlist; reflecting every origin with
  // credentials enabled permits arbitrary sites to act as the user.
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(cors(corsOptions));

  const ioServer = new Server(http, {
    cors: corsOptions,
    ...socketIOConfig,
  });

  ioServer.on('connection', (socket) => {
    handleWire(socket, { log: (msg) => console.log(msg) });
  });

  app.get('/', (req, res) => {
    res.send('Ok');
  });

  app.use((req, res) => res.status(404).send('Not found'));
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).send('Internal server error');
  });

  http.listen(port, () => {
    console.log(`Wire.io is listening on *:${port}`);
  });
};

export default startServer;
