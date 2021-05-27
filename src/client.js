import { nanoid } from 'nanoid';

class Client2CLient {
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
   */
  register(name, callback) {
    // Executed when another client call the function
    const toBeCalled = async ({ callId, params }) => {
      try {
        const result = await callback(params);
        this._socket.emit(`${this.room}.result.${callId}`, {
          ok: result,
        });
      } catch (err) {
        // Error handling
        this._socket.emit(`${this.room}.result.${callId}`, { err: '' + err });
      }
    };
    return new Promise((resolve) => {
      this._socket.once(`${this.room}.register.${name}`, () => {
        this._socket.on(`${this.room}.call.${name}`, toBeCalled);

        // Return unregister callback
        const unregisterCallback = () =>
          new Promise((resolve) => {
            this._socket.once(`${this.room}.unregister.${name}`, () => {
              this._socket.off(`${this.room}.call.${name}`);
              resolve();
            });
            this._socket.emit(`${this.room}.unregister`, { name });
          });

        this.toUnregister.push(unregisterCallback);

        resolve(unregisterCallback);
      });
      this._socket.emit(`${this.room}.register`, { name });
    });
  }

  /**
   * Call a previously registered function with `params` arguments.
   * @param {string} name of function
   * @param {*} params arguments of the called function.
   */
  call(name, params) {
    return new Promise((resolve, reject) => {
      const callId = nanoid();
      this._socket.once(`${this.room}.result.${callId}`, (result) => {
        if (result.hasOwnProperty('ok')) {
          resolve(result.ok);
        } else {
          reject(result.err);
        }
      });
      this._socket.emit(`${this.room}.call`, { name, callId, params });
    });
  }
}

/**
 * Join a client2client room.
 * @param {socket} socket socket.io instance.
 * @param {string} name of the room
 * @param {function} onMaster is called when the client become the master of
 *   the room, i.e. the first client or the next one if the first quit.
 * @param {function} onJoined is called on each connection, reconnection after
 *   client2client is initialized.
 * @param {string} userId (optionnal) to force userId.
 */
export const joinClient2Client = ({
  socket,
  room,
  onJoined = () => {},
  onMaster = () => {},
  userId = null,
}) => {
  const C2Croom = new Client2CLient(socket, room, userId);
  return new Promise((resolve) => {
    // Avoid multiple join
    let waitForResponse = true;
    socket.on(`${room}.isMaster`, () => {
      if (C2Croom._left) {
        return;
      }
      onMaster(room);
    });

    socket.on(`${room}.roomJoined`, (userId) => {
      if (C2Croom._left) {
        return;
      }
      C2Croom.userId = userId;
      waitForResponse = false;
      onJoined(C2Croom);
      resolve(C2Croom);
    });

    // Rejoin on reconnection
    socket.on('connect', () => {
      // If joined already called or room left
      // we quit
      if (C2Croom._left || waitForResponse) {
        return;
      }
      // Restore events with same userId
      socket.emit('joinSuperSocket', {
        room,
        userId: C2Croom.userId,
      });
    });
    socket.emit('joinSuperSocket', { room, userId });
  });
};

export default joinClient2Client;
