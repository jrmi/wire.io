// Test app
import express from 'express';
import { handleC2C } from '.';

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
