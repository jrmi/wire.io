import express from 'express';
import handleSuperSocket from './server';

var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

const port = process.env.PORT || 4000;

http.listen(port, () => {
  console.log(`listening on *:${port}`);
});

io.on('connection', (socket) => {
  handleSuperSocket(socket);
});
