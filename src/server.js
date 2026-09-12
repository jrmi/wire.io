import { nanoid } from 'nanoid';

const rooms = new Map();
const MAX_NAME_LENGTH = 128;

const isValidName = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_NAME_LENGTH &&
  !/[\u0000-\u001f\u007f]/u.test(value);

const assertValidName = (value, label) => {
  if (!isValidName(value)) throw new Error(`Invalid ${label}`);
};

const isObject = (value) => value !== null && typeof value === 'object';

export const handleWire = (
  socket,
  { log = console.log, logPrefix = '[Wire.io] ' } = {}
) => {
  socket.on('joinSuperSocket', (payload) => {
    if (!isObject(payload)) {
      socket.emit('wire.error', 'Invalid join payload');
      return;
    }
    const { room: roomName, userId: givenUserId } = payload;
    try {
      assertValidName(roomName, 'room name');
      if (givenUserId !== null && givenUserId !== undefined) {
        assertValidName(givenUserId, 'user id');
      }
    } catch (error) {
      socket.emit('wire.error', error.message);
      return;
    }
    socket.join(roomName);

    if (!rooms.has(roomName)) {
      rooms.set(roomName, { users: [], rpc: Object.create(null) });
    }
    const room = rooms.get(roomName);

    const userId = givenUserId || nanoid();

    const registeredRPCs = Object.create(null);

    let isMaster = room.users.length === 0;

    const promoteMaster = () => {
      isMaster = true;
      socket.emit(`${roomName}.isMaster`);
    };

    room.users.push({
      socket,
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
          if (Object.hasOwn(result, 'ok')) {
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
      assertValidName(name, 'RPC name');
      if (!['single', 'first', 'last', 'random'].includes(invoke)) {
        throw new Error('Invalid invoke mode');
      }
      const existingInvoke = room.rpc[name]?.invoke;
      const existingCallbacks = room.rpc[name]?.callbacks || [];

      if (existingInvoke && invoke !== existingInvoke) {
        throw new Error(
          `Can't register a new function under the ${name} with this invoke value.`
        );
      }
      if (
        existingInvoke === 'single' &&
        existingCallbacks.length >= 1 &&
        existingCallbacks[0] !== registeredRPCs[name]
      ) {
        throw new Error(`Function ${name} already exists`);
      }

      if (!room.rpc[name]) {
        room.rpc[name] = {
          invoke,
          callbacks: [],
        };
      }

      // Remove previously registered callback from the same client
      if (registeredRPCs[name]) {
        room.rpc[name].callbacks = room.rpc[name].callbacks.filter(
          (callback) => callback !== registeredRPCs[name]
        );
      }

      const rpcCallback = async (params) => {
        if (!socket.connected) {
          throw new Error(`Function ${name} is not registered`);
        }
        return await _callClientRPC(name, params);
      };

      registeredRPCs[name] = rpcCallback;
      room.rpc[name].callbacks.push(rpcCallback);
    };

    /**
     * Unregister a RPC from the client.
     * @param {*} param0
     */
    const unregister = ({ name }) => {
      assertValidName(name, 'RPC name');
      if (room.rpc[name] !== undefined) {
        const { callbacks } = room.rpc[name];

        room.rpc[name].callbacks = callbacks.filter(
          (rpc) => rpc !== registeredRPCs[name]
        );
        // Remove everything if it was the last function
        if (room.rpc[name].callbacks.length === 0) {
          delete room.rpc[name];
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
        !isValidName(name) ||
        room.rpc[name] === undefined ||
        room.rpc[name].callbacks.length === 0
      ) {
        throw new Error(`Function ${name} is not registered`);
      } else {
        const { invoke, callbacks } = room.rpc[name];

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
    socket.on(`${roomName}._call`, async (payload) => {
      const callId = isObject(payload) ? payload.callId : null;
      try {
        if (!isObject(payload)) throw new Error('Invalid RPC payload');
        const { name, params } = payload;
        assertValidName(callId, 'call id');
        if (typeof name !== 'string' || !Object.hasOwn(actions, name)) {
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
    socket.on(`${roomName}.publish`, (payload) => {
      if (!isObject(payload) || !isValidName(payload.name)) return;
      const { name, params, self } = payload;
      if (self) {
        socket.emit(`${roomName}.${name}`, params);
      }
      socket.broadcast.to(roomName).emit(`${roomName}.${name}`, params);
    });

    /**
     * Called when the user leave the room.
     */
    let left = false;
    const onLeave = () => {
      if (left || !rooms.has(roomName)) return;
      left = true;
      rooms.delete(roomName);
      const currentRoom = room;
      // Remove registered RPCs from this client
      currentRoom.rpc = Object.assign(Object.create(null), Object.fromEntries(
        Object.entries(currentRoom.rpc)
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
      ));

      currentRoom.users = currentRoom.users.filter(
        ({ socket: joinedSocket }) => joinedSocket !== socket
      );

      log(
        `${logPrefix}User ${userId} quit room ${roomName}.${
          isMaster ? ' Was room master. ' : ''
        } ${currentRoom.users.length} user(s) left.`
      );

      // Promote the first user if master is gone
      if (
        currentRoom.users.length > 0 &&
        !currentRoom.users[0].isMaster
      ) {
        const user = currentRoom.users[0];
        user.isMaster = true;
        user.promoteMaster();
        log(`${logPrefix}Promote ${user.userId} master of room ${roomName}`);
      }
      socket.broadcast.to(roomName).emit(`${roomName}.userLeave`, userId);

      if (currentRoom.users.length > 0) rooms.set(roomName, currentRoom);
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
      } Room has ${room.users.length} user(s)`
    );
  });
};

export default handleWire;
