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

    /**
     * Call a remote function on the client.
     * @param {string} name the name of the function
     * @param {*} params the params of the call
     * @returns the call result (async).
     */
    const _callClientRPC = async (name, params) => {
      const callId = nanoid();
      return new Promise((resolve, reject) => {
        socket.once(`${roomName}._result.${callId}`, (result) => {
          if (result.hasOwnProperty('ok')) {
            resolve(result.ok);
          } else {
            reject(new Error(result.err));
          }
        });
        socket.emit(`${roomName}._call`, { callId, name, params });
      });
    };

    /**
     * Register a new RPC from the client.
     * @param {*} param0
     */
    const register = ({ name, invoke = 'single' }) => {
      const existingInvoke = rooms[roomName].rpc[name]?.invoke;

      if (existingInvoke && invoke !== existingInvoke) {
        throw new Error(
          `Can't register a new function under the ${name} with this invoke value.`
        );
      }
      if (
        existingInvoke == 'single' &&
        rooms[roomName].rpc[name].callbacks.length >= 1
      ) {
        throw new Error(`Function ${name} already exists`);
      }

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

      const rpcCallback = async (params) => {
        if (!socket.connected) {
          throw new Error(`Function ${name} is not registered`);
        }
        return await _callClientRPC(name, params);
      };

      registeredRPCs[name] = rpcCallback;
      rooms[roomName].rpc[name].callbacks.push(rpcCallback);
    };

    /**
     * Unregister a RPC from the client.
     * @param {*} param0
     */
    const unregister = ({ name }) => {
      if (rooms[roomName].rpc[name] !== undefined) {
        const { callbacks } = rooms[roomName].rpc[name];

        rooms[roomName].rpc[name].callbacks = callbacks.filter(
          (rpc) => rpc !== registeredRPCs[name]
        );
        // Remove everything if it was the last function
        if (rooms[roomName].rpc[name].callbacks.length === 0) {
          delete rooms[roomName].rpc[name];
        }
        delete registeredRPCs[name];
      }
    };

    /**
     * Call a RPC on another client.
     * @param {*} param0
     * @returns
     */
    const call = async ({ name, params }) => {
      if (
        rooms[roomName].rpc[name] === undefined ||
        rooms[roomName].rpc[name].callbacks.length === 0
      ) {
        throw new Error(`Function ${name} is not registered`);
      } else {
        const { invoke, callbacks } = rooms[roomName].rpc[name];

        let callback;

        // Select the callback to execute
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
            callback = callbacks[0];
        }

        return await callback(params);
      }
    };

    const actions = { register, unregister, call };

    /**
     * Handle all calls from the client.
     */
    socket.on(`${roomName}._call`, async ({ callId, name, params }) => {
      try {
        if (!actions[name]) {
          throw new Error(`Method ${name} does not exist`);
        }
        const result = await actions[name](params);
        socket.emit(`${roomName}._result.${callId}`, {
          ok: result ? result : null,
        });
      } catch (err) {
        socket.emit(`${roomName}._result.${callId}`, { err: `${err.message}` });
      }
    });

    // Publish event to others and self if `self`
    socket.on(`${roomName}.publish`, ({ name, params, self }) => {
      if (self) {
        socket.emit(`${roomName}.${name}`, params);
      }
      socket.broadcast.to(roomName).emit(`${roomName}.${name}`, params);
    });

    /**
     * Called when the user leave the room.
     */
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
      // Remove all listeners
      socket.removeAllListeners(`${roomName}._call`);
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
