# Client2client.io

A web client to client communication channel that mimic [WAMP protocol](https://wamp-proto.org/). You can pub/sub event and make RPC calls.
Way mush simpler and light than Autobahn and don't need a fat router when you need something less powerfull. It based on
venerable and very usefull [socket.io](https://socket.io/).

## Installation

```sh
npm install client2client.io
```

## Usage

Client2client rely on [socket.io](https://socket.io/) on server and client.

### Serve side code

```js
import express from 'express';
import { handleC2C } from 'client2client';

var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

const port = process.env.PORT || 4000;

http.listen(port, () => {
  console.log(`listening on *:${port}`);
});

io.on('connection', (socket) => {
  handleC2C(socket);
});
```

## Client side code

```js
import io from 'socket.io-client';

const socket = io.connect("<socket server url>", {
      'reconnection delay': 0,
      'reopen delay': 0,
      forceNew: true,
    });

// Create room object
const room = await join({
  socket: socket, // Socket io socket object
  room: 'test', // Room name
  onJoined = (room) => { // Callback when room is joined (Optionnal)
    console.log("Connected to client2client server with id ", room.userId);
  },
  onMaster = (room) => { // Callback if the user is the room master i.e. the first user (on next if first quit). (Optionnal)
    console.log("You are now master of the room");
  },
  userId: "myuserid" // To force user id (Optionnal)
});

```

## API

All call are client side. Since you have the room instance you can comunicate with other client with this API.

### .publish("eventName", params, self=false)

Send an event to all other client in room. Also to self if true.
`params` can be any js type that is serializable.

### .subsribe("eventName", callback) -> unsubscribe callback

Subscribe the callback to an event. The callback receive the params data if any.

### .register("functionName", callback, force=false) -> unregister callback

Register a function to be called by other clients. If any client use `.call` with the same function name,
 the callback will be called with the given parameters.

`force` parameter force registration even if the function have already been registered.

### .call("functionName", params) -> call result

Call a previously registered function. Return the RPC result.


## Dev installation

First install dependencies:

```sh
npm install
```

Start the server:

```sh
npm run server
```

Then run tests:

```sh
npm test
```
