import { nanoid } from 'nanoid';

const rooms = {};

export const handleC2C = (socket) => {
  socket.on('joinSuperSocket', ({ name: roomName }) => {
    socket.join(roomName);

    if (rooms[roomName] === undefined) {
      rooms[roomName] = { users: [], rpc: {} };
    }

    const userId = nanoid();
    console.log('user', userId, 'joined');

    //rooms[roomName].users.push(userId);

    // Publish event to others and self if `self`
    socket.on('publish', ({ name, params, self }) => {
      if (self) {
        socket.emit(name, params);
      }
      socket.broadcast.to(roomName).emit(name, params);
    });

    // Register new remote function
    socket.on('register', ({ name }) => {
      // Define function for the room
      rooms[roomName].rpc[name] = ({ callId, params }) => {
        return new Promise((resolve, reject) => {
          if (!socket.connected) {
            // Handle case of disconnected socket
            delete rooms[roomName].rpc[name];
            resolve({ err: `Function ${name} is not registered` });
          } else {
            const callback = (result) => {
              // Clean listening
              socket.off(`result.${callId}`, callback);
              resolve(result);
            };
            // Schedule result
            socket.on(`result.${callId}`, callback);
            // Call function from client
            socket.emit(`call.${name}`, { callId, params });
          }
        });
      };
      socket.emit(`register.${name}`);
    });

    socket.on('unregister', ({ name }) => {
      delete rooms[roomName].rpc[name];
      socket.emit(`unregister.${name}`);
    });

    // Call function from another client
    socket.on('call', async ({ name, callId, params }) => {
      if (rooms[roomName].rpc[name] === undefined) {
        socket.emit(`result.${callId}`, {
          err: `Function ${name} is not registered`,
        });
      } else {
        const result = await rooms[roomName].rpc[name]({
          callId,
          params,
        });
        socket.emit(`result.${callId}`, result);
      }
    });

    socket.on('disconnect', () => {
      /*rooms[roomName].users = rooms[roomName].users.filter(
        (id) => id !== userId
      );*/
      socket.broadcast.to(roomName).emit('userLeave', userId);
    });

    socket.emit('roomJoined', userId);
    socket.broadcast.to(roomName).emit('userEnter', userId);
  });
};

export default handleC2C;
