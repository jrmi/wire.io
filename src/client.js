import { nanoid } from 'nanoid';

class Wire {
  constructor(socket, room, userId = null) {
    this._socket = socket;
    this.userId = userId;
    this.room = room;
    this.toUnregister = [
      () => {
        this._socket.off(`${this.room}.isMaster`);
        this._socket.off(`${this.room}.roomJoined`);
      },
    ];
    this._left = false;

    this.registeredRPC = {};

    // Receive server RPC calls
    this._socket.on(`${this.room}._call`, async ({ callId, name, params }) => {
      try {
        const result = await this.registeredRPC[name](params);
        socket.emit(`${this.room}._result.${callId}`, {
          ok: result ? result : null,
        });
      } catch (err) {
        socket.emit(`${this.room}._result.${callId}`, {
          err: `${err.message}`,
        });
      }
    });
  }

  /**
   * Call a server procedure.
   *
   * @param {string} action name of the operation to call on the server.
   * @param {*} params the params of the action.
   * @returns the result of the call.
   */
  async _callServerRPC(name, params) {
    const callId = nanoid();
    return new Promise((resolve, reject) => {
      this._socket.once(`${this.room}._result.${callId}`, (result) => {
        if (result.hasOwnProperty('ok')) {
          resolve(result.ok);
        } else {
          reject(result.err);
        }
      });
      this._socket.emit(`${this.room}._call`, { callId, name, params });
    });
  }

  /**
   * Leave current room
   * @param {string} room name.
   */
  leave() {
    this._left = true;
    this.toUnregister.forEach((callback) => {
      callback();
    });
    this._socket.emit(`${this.room}.leave`);
  }

  /**
   * Send an event to all other client in room. Also to self if true.
   * @param {string} name Name of event
   * @param {*} params arguments of event
   * @param {boolean} self if true, the publish get the event too
   */
  publish(name, params, self = false) {
    this._socket.emit(`${this.room}.publish`, { name, params, self });
  }

  /**
   * Subscribe to an event.
   * @param {string} event Name of event
   * @param {function} callback Called when the event is received. First param
   *   of the function is the params sent with the event.
   */
  subscribe(event, callback) {
    this._socket.on(`${this.room}.${event}`, callback);

    const unregisterCallback = () => {
      this._socket.off(`${this.room}.${event}`, callback);
    };

    this.toUnregister.push(unregisterCallback);

    return unregisterCallback;
  }

  /**
   * Register a new RPC function.
   * @param {string} name of function
   * @param {function} callback the function that handle the function result
   * @param {object} params the configuration of the RPC. For now only `invoke`
   *   parameter is allowed with the following values:
   *     - 'single' for a RPC that can be registered only once.
   *     - 'first' The first registered client is called.
   *     - 'last' The last registered client is called.
   *     - 'random' A random RPC is called.
   */
  async register(name, callback, { invoke = 'single' } = {}) {
    // Add to locally registered callback
    this.registeredRPC[name] = callback;

    await this._callServerRPC('register', {
      name,
      invoke,
    });

    // Return unregister callback
    const unregisterCallback = () => {
      delete this.registeredRPC[name];
      return this._callServerRPC('unregister', { name });
    };

    this.toUnregister.push(unregisterCallback);

    return unregisterCallback;
  }

  /**
   * Call a previously registered function with `params` arguments.
   * @param {string} name of function
   * @param {*} params parameters of the called function.
   */
  async call(name, params) {
    return await this._callServerRPC('call', { name, params });
  }
}

/**
 * Join a wire.io room.
 * @param {socket} socket socket.io instance.
 * @param {string} name of the room
 * @param {function} onMaster is called when the client become the master of
 *   the room, i.e. the first client or the next one if the first quit.
 * @param {function} onJoined is called on each connection, reconnection after
 *   wire.io is initialized.
 * @param {string} userId (optional) to force userId.
 */
export const joinWire = ({
  socket,
  room,
  onJoined = () => {},
  onMaster = () => {},
  userId = null,
}) => {
  const WireRoom = new Wire(socket, room, userId);
  return new Promise((resolve) => {
    // Avoid multiple join
    let waitForResponse = true;
    socket.on(`${room}.isMaster`, () => {
      if (WireRoom._left) {
        return;
      }
      onMaster(room);
    });

    socket.on(`${room}.roomJoined`, (userId) => {
      if (WireRoom._left) {
        return;
      }
      WireRoom.userId = userId;
      waitForResponse = false;
      onJoined(WireRoom);
      resolve(WireRoom);
    });

    // Rejoin on reconnection
    socket.on('connect', () => {
      // If joined already called or room left
      // we quit
      if (WireRoom._left || waitForResponse) {
        return;
      }
      // Restore events with same userId
      socket.emit('joinSuperSocket', {
        room,
        userId: WireRoom.userId,
      });
    });
    socket.emit('joinSuperSocket', { room, userId });
  });
};

export default joinWire;
