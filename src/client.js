import { nanoid } from 'nanoid';

class Client2CLient {
  constructor(socket) {
    this._socket = socket;
    this.userId = null;
    socket.on('roomJoined', (userId) => (this.userId = userId));
  }

  /**
   * Send an event to all other client in room. Also to self if true.
   * @param {string} name Name of event
   * @param {*} params arguments of event
   * @param {boolean} self if true, the publish get the event too
   */
  publish(name, params, self = false) {
    this._socket.emit('publish', { name, params, self });
  }

  /**
   * Subscribe to an event.
   * @param {string} event Name of event
   * @param {function} callback Called when the event is received. First param
   *   of the function is the params sent with the event.
   */
  subscribe(event, callback) {
    this._socket.on(event, callback);
    return () => {
      this._socket.off(event, callback);
    };
  }

  /**
   * Register a new RPC function.
   * @param {string} name of function
   * @param {function} callback the function that handle the function result
   */
  register(name, callback, { force = false } = {}) {
    const toBeCalled = async ({ callId, params }) => {
      try {
        const result = await callback(params);
        this._socket.emit(`result.${callId}`, {
          ok: result,
        });
      } catch (err) {
        this._socket.emit(`result.${callId}`, { err: '' + err });
      }
    };
    return new Promise((resolve) => {
      const registerCallback = () => {
        this._socket.off(`register.${name}`, registerCallback);
        this._socket.on(`call.${name}`, toBeCalled);
        resolve(
          () =>
            new Promise((resolve) => {
              const unregisterCallback = () => {
                this._socket.off(`call.${name}`, toBeCalled);
                this._socket.off(`unregister.${name}`, unregisterCallback);
                resolve();
              };
              this._socket.on(`unregister.${name}`, unregisterCallback);
              this._socket.emit('unregister', { name });
            })
        );
      };
      this._socket.on(`register.${name}`, registerCallback);
      this._socket.emit('register', { name });
    });
  }

  /**
   * Call the previously registered function with `params` arguments.
   * @param {string} name of function
   * @param {*} params arguments of the called function.
   */
  call(name, params) {
    return new Promise((resolve, reject) => {
      const callId = nanoid();
      this._socket.on(`result.${callId}`, (result) => {
        if (result.hasOwnProperty('ok')) {
          resolve(result.ok);
        } else {
          reject(result.err);
        }
        this._socket.off(`result.${callId}`);
      });
      this._socket.emit(`call`, { name, callId, params });
    });
  }
}

/**
 * Join a super socket room.
 * @param {socket} socket socket.io socket object.
 * @param {string} name of the room
 * @param {function} onMaster is called when the client became the master of
 *   the room, i.e. the first client or the next one if the first quit.
 */
export const joinClient2Client = (socket, name, onMaster = () => {}) => {
  const room = new Client2CLient(socket);
  return new Promise((resolve, reject) => {
    socket.on('isMaster', () => {
      onMaster(room);
    });
    socket.on('roomJoined', () => {
      resolve(room);
    });
    socket.emit('joinSuperSocket', { name });
  });
};

// TODO should return disconnect all
// TODO handle onMaster

export default joinClient2Client;
