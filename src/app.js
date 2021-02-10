// Test app
import express from 'express';
import { handleC2C } from '.';

var app = express();
var http = require('http').createServer(app);

const corsOption = {
  credentials: true,
  origin: (origin, callback) => {
    // Allow ALL origins pls
    return callback(null, true);
  },
};

var io = require('socket.io')(http, {
  cors: corsOption,
});

const port = process.env.PORT || 4000;

io.on('connection', (socket) => {
  handleC2C(socket);
});

http.listen(port, () => {
  console.log(`listening on *:${port}`);
});
