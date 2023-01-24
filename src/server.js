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

    const registeredRPCs = {};

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
    socket.on(
      `${roomName}.register`,
      ({ registerId, name, invoke = 'single' }) => {
        const existingInvoke = rooms[roomName].rpc[name]?.invoke;

        if (existingInvoke && invoke !== existingInvoke) {
          socket.emit(`${roomName}.register.${name}.${registerId}`, {
            err: `Can't register a new function under the ${name} with this invoke value.`,
          });
          return;
        }
        if (
          existingInvoke == 'single' &&
          rooms[roomName].rpc[name].callbacks.length >= 1
        ) {
          socket.emit(`${roomName}.register.${name}.${registerId}`, {
            err: `Function ${name} al`,
          });
          return;
        }

        // Define function for the RPC
        const rpcCallback = ({ callId, params }) => {
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

        if (!rooms[roomName].rpc[name]) {
          rooms[roomName].rpc[name] = {
            invoke,
            callbacks: [],
          };
        }

        // Remove previously registered callback from the same client
        if (registeredRPCs[name]) {
          rooms[roomName].rpc[name].callbacks = rooms[roomName].rpc[
            name
          ].callbacks.filter((callback) => callback !== registeredRPCs[name]);
        }

        registeredRPCs[name] = rpcCallback;
        rooms[roomName].rpc[name].callbacks.push(rpcCallback);

        socket.emit(`${roomName}.register.${name}.${registerId}`, { ok: true });
      }
    );

    socket.on(`${roomName}.unregister`, ({ name }) => {
      if (rooms[roomName].rpc[name] === undefined) {
        socket.emit(`${roomName}.unregister.${name}`);
      } else {
        const { callbacks } = rooms[roomName].rpc[name];

        rooms[roomName].rpc[name].callbacks = callbacks.filter(
          (rpc) => rpc !== registeredRPCs[name]
        );
        // Remove everything if it was the last
        if (rooms[roomName].rpc[name].callbacks.length === 0) {
          delete rooms[roomName].rpc[name];
        }
        delete registeredRPCs[name];

        socket.emit(`${roomName}.unregister.${name}`);
      }
    });

    // Call a RPC from another client
    socket.on(`${roomName}.call`, async ({ name, callId, params }) => {
      if (
        rooms[roomName].rpc[name] === undefined ||
        rooms[roomName].rpc[name].callbacks.length === 0
      ) {
        socket.emit(`${roomName}.result.${callId}`, {
          err: `Function ${name} is not registered`,
        });
      } else {
        const { invoke, callbacks } = rooms[roomName].rpc[name];
        let callback;
        switch (invoke) {
          case 'random':
            callback = callbacks[Math.floor(Math.random() * callbacks.length)];
            break;
          case 'last':
            callback = callbacks.at(-1);
            break;
          case 'first':
          case 'single':
          default:
            // Select the callback to execute
            callback = callbacks[0];
        }
        const result = await callback({
          callId,
          params,
        });
        // Return result to caller
        socket.emit(`${roomName}.result.${callId}`, result);
      }
    });

    const onLeave = () => {
      // Remove registered RPCs from this client
      rooms[roomName].rpc = Object.fromEntries(
        Object.entries(rooms[roomName].rpc)
          .map(([name, { invoke, callbacks }]) => {
            return [
              name,
              {
                invoke,
                callbacks: callbacks.filter(
                  (rpc) => rpc !== registeredRPCs[name]
                ),
              },
            ];
          })
          .filter(([name, { callbacks }]) => callbacks.length !== 0)
      );

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
