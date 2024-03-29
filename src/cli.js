#!/usr/bin/env node

import startServer from './startServer.js';
import dotenv from 'dotenv';

dotenv.config();

export const SOCKET_PATH =
  process.env.WIREIO_SOCKET_PATH || process.env.SOCKET_PATH || '/socket.io';
export const SOCKET_COMPAT = ['1', 'true'].includes(process.env.SOCKET_COMPAT);
export const PORT = process.env.WIREIO_PORT || process.env.PORT || 4000;
export const MAX_HTTP_BUFFER_SIZE = process.env.WIREIO_MAX_HTTP_BUFFER_SIZE  || 1e6 /*1MB*/;

if (SOCKET_COMPAT) {
  console.log(`Socket.io 2.X compatibility is enabled`);
}

startServer({
  socketIOConfig: { path: SOCKET_PATH, allowEIO3: SOCKET_COMPAT, maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE },
  port: PORT,
});
