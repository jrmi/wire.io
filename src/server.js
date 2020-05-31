const rooms = {};

export const handleSuperSocket = (socket) => {
  socket.on('joinSuperSocket', ({ name: roomName }) => {
    console.log(`New user for room ${roomName}`);
    socket.join(roomName);

    if (rooms[roomName] === undefined) {
      rooms[roomName] = {};
    }

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
      rooms[roomName][name] = ({ callId, params }) =>
        new Promise((resolve, reject) => {
          const callback = (result) => {
            // Clean listening
            socket.off(`result.${callId}`, callback);
            resolve(result);
          };
          // Schedule result
          socket.on(`result.${callId}`, callback);
          // Call function from client
          socket.emit(`call.${name}`, { callId, params });
        });
      socket.emit(`register.${name}`);
    });

    socket.on('unregister', ({ name }) => {
      delete rooms[roomName][name];
    });

    // Call function from another client
    socket.on('call', async ({ name, callId, params }) => {
      const result = await rooms[roomName][name]({ callId, params });
      socket.emit(`result.${callId}`, result);
    });

    socket.emit('roomJoined');
  });
};

export default handleSuperSocket;
