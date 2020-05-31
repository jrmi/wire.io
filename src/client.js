import { nanoid } from 'nanoid';

class Room {
  constructor(socket) {
    this._socket = socket;
  }

  /**
   * Send an event to all other client in room. Also to self if true.
   * @param {string} name Name of event
   * @param {*} params Params of event
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
   * @param {function} callback the function executed when the RPC is done
   */
  register(name, callback, { force = false } = {}) {
    this._socket.on(`register.${name}`, () => {
      this._socket.on(`call.${name}`, ({ callId, params }) => {
        try {
          const result = callback(params);
          this._socket.emit(`result.${callId}`, {
            ok: result,
          });
        } catch (err) {
          this._socket.emit(`result.${callId}`, { err: err });
        }
      });
    });
    this._socket.emit('register', { name });
    return () => {
      this._socket.emit('unregister', { name });
    };
  }

  /**
   * Call the previously registered function with `params` arguments.
   * @param {string} name of function
   * @param {*} params arguments of the called function.
   */
  call(name, params) {
    const callId = nanoid();
    return new Promise((resolve, reject) => {
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
export const join = (socket, name, onMaster = () => {}) => {
  const room = new Room(socket);
  return new Promise((resolve, reject) => {
    socket.on('roomJoined', () => {
      resolve(room);
    });
    socket.emit('joinSuperSocket', { name });
  });
};

export default join;
