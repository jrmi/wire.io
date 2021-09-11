# Wire.io

A web client to client communication channel that mimic [WAMP protocol](https://wamp-proto.org/). You can pub/sub event and make RPC calls directly to other clients through a router.
Way mush simpler and light than Autobahn and don't need a fat router when you need something less powerfull. It based on
venerable and very usefull [socket.io](https://socket.io/).

Compatible with 2.X and 3.X version of socket.io.

## Usage

Wire.io rely on [socket.io](https://socket.io/) for server and client.

Launch the server without installing with npx:

```sh
npx wire.io # need npm v7 in order to work
```

## Installation

```sh
npm install wire.io
```

### Serve side code

```js
import express from 'express';
import { handleWire } from 'wire.io';

var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

const port = process.env.PORT || 4000;

http.listen(port, () => {
  console.log(`listening on *:${port}`);
});

io.on('connection', (socket) => {
  const options = { // This are defaults
    log: console.log;
    logPrefix = '[Wire] '
  }
  handleWire(socket, options); // Option is optionnal
});
```

## Client side code

```js
import io from 'socket.io-client';
import { join } from 'wire.io';

const socket = io.connect("<socket server url>", {
      'reconnection delay': 0,
      'reopen delay': 0,
      forceNew: true,
    });

// Create room object
const room = await joinWire({
  socket: socket, // Socket io socket object
  room: 'test', // Room name
  onJoined = (room) => { // Callback when room is joined (Optionnal)
    console.log("Connected to wire.io server with id ", room.userId);
  },
  onMaster = (room) => { // Callback if the user is the room master i.e. the first user (on next if first quit). (Optionnal)
    console.log("You are now master of the room");
  },
  userId: "myuserid" // To force user id (Optionnal)
});

```

## API

All calls are client side. Since you have the room instance you can comunicate with other client with this API.

### .publish("eventName", params, self=false)

Send an event to all other clients in room. Also to self if true.
`params` can be any js type that is serializable.

### .subsribe("eventName", callback) -> unsubscribe callback

Subscribe the callback to an event. The callback receive the params data if any.

### .register("functionName", callback) -> unregister callback

Register a function to be called by other clients. If any client use `.call` with the same function name,
 the callback will be called with the given parameters.

### .call("functionName", params) -> call result

Call a previously registered function. Return the call result.

## Dev installation

First install dependencies:

```sh
npm ci
```

Start the server in watch mode:

```sh
npm run dev
```

Then run tests:

```sh
npm test
```
