import { nanoid } from 'nanoid';

const rooms = {};

export const handleWire = (
  socket,
  { log = console.log, logPrefix = '[Wire.io] ' } = {}
) => {
  socket.on('joinSuperSocket', ({ room: roomName, userId: givenUserId }) => {
    socket.join(roomName);

    if (rooms[roomName] === undefined) {
      rooms[roomName] = { users: [], rpc: {} };
    }

    const userId = givenUserId || nanoid();

    let isMaster = rooms[roomName].users.length === 0;

    const promoteMaster = () => {
      isMaster = true;
      socket.emit(`${roomName}.isMaster`);
    };

    rooms[roomName].users.push({
      userId,
      promoteMaster,
      isMaster,
    });

    // Publish event to others and self if `self`
    socket.on(`${roomName}.publish`, ({ name, params, self }) => {
      if (self) {
        socket.emit(`${roomName}.${name}`, params);
      }
      socket.broadcast.to(roomName).emit(`${roomName}.${name}`, params);
    });

    // Register new remote function
    socket.on(`${roomName}.register`, ({ name }) => {
      // Define function for the room
      rooms[roomName].rpc[name] = ({ callId, params }) => {
        return new Promise((resolve, reject) => {
          if (!socket.connected) {
            // Handle case of disconnected socket
            delete rooms[roomName].rpc[name];
            resolve({ err: `Function ${name} is not registered` });
          } else {
            // Schedule result
            socket.once(`${roomName}.result.${callId}`, (result) => {
              resolve(result);
            });
            // Call function from client
            socket.emit(`${roomName}.call.${name}`, { callId, params });
          }
        });
      };
      socket.emit(`${roomName}.register.${name}`);
    });

    socket.on(`${roomName}.unregister`, ({ name }) => {
      delete rooms[roomName].rpc[name];
      socket.emit(`${roomName}.unregister.${name}`);
    });

    // Call function from another client
    socket.on(`${roomName}.call`, async ({ name, callId, params }) => {
      if (rooms[roomName].rpc[name] === undefined) {
        socket.emit(`${roomName}.result.${callId}`, {
          err: `Function ${name} is not registered`,
        });
      } else {
        const result = await rooms[roomName].rpc[name]({
          callId,
          params,
        });
        socket.emit(`${roomName}.result.${callId}`, result);
      }
    });

    const onLeave = () => {
      rooms[roomName].users = rooms[roomName].users.filter(
        ({ userId: uid }) => uid !== userId
      );
      log(
        `${logPrefix}User ${userId} quit room ${roomName}.${
          isMaster ? ' Was room master. ' : ''
        } ${rooms[roomName].users.length} user(s) left.`
      );

      // Promote the first user if master is gone
      if (
        rooms[roomName].users.length > 0 &&
        !rooms[roomName].users[0].isMaster
      ) {
        const user = rooms[roomName].users[0];
        user.isMaster = true;
        user.promoteMaster();
        log(`${logPrefix}Promote ${user.userId} master of room ${roomName}`);
      }
      socket.broadcast.to(roomName).emit(`${roomName}.userLeave`, userId);
    };

    socket.on('disconnect', onLeave);

    socket.once(`${roomName}.leave`, () => {
      socket.removeAllListeners(`${roomName}.register`);
      socket.removeAllListeners(`${roomName}.unregister`);
      socket.removeAllListeners(`${roomName}.call`);
      socket.removeAllListeners(`${roomName}.publish`);
      socket.off('disconnect', onLeave);
      onLeave();
      socket.leave(roomName);
    });

    if (isMaster) {
      promoteMaster();
    }
    socket.emit(`${roomName}.roomJoined`, userId);
    socket.broadcast.to(roomName).emit(`${roomName}.userEnter`, userId);
    log(
      `${logPrefix}User ${userId} joined room ${roomName}.${
        isMaster ? ' Is room master.' : ''
      } Room has ${rooms[roomName].users.length} user(s)`
    );
  });
};

export default handleWire;
