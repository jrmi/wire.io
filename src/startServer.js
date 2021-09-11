import express from 'express';
import { createServer } from 'http';
import io from 'socket.io';
import cors from 'cors';

import { handleWire } from '.';

const startServer = ({ socketIOConfig = {}, port = 4000 }) => {
  var app = express();
  var http = createServer(app);

  const corsOption = {
    credentials: true,
    origin: (origin, callback) => {
      // Allow ALL origins pls
      return callback(null, true);
    },
  };

  app.use(cors(corsOption));

  const ioServer = io(http, {
    ...socketIOConfig,
  });

  ioServer.on('connection', (socket) => {
    handleWire(socket, { log: (msg) => console.log(msg) });
  });

  app.get('/', (req, res) => {
    res.send('Ok');
  });

  http.listen(port, () => {
    console.log(`listening on *:${port}`);
  });
};

export default startServer;
