import startServer from './startServer';
import dotenv from 'dotenv';

dotenv.config();

export const SOCKET_PATH = process.env.SOCKET_PATH || '/socket.io';
export const SOCKET_COMPAT = ['1', 'true'].includes(process.env.SOCKET_COMPAT);
export const PORT = process.env.PORT || 4000;

if (SOCKET_COMPAT) {
  log.info(`Socket.io 2.X compatibility is enabled`);
}

startServer({
  socketIOConfig: { path: SOCKET_PATH, allowEIO3: SOCKET_COMPAT },
  port: PORT,
});
