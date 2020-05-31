import io from 'socket.io-client';
import join from './client';

describe('Client', () => {
  let socket1 = null;
  let socket2 = null;
  beforeEach((done) => {
    socket1 = io.connect('http://localhost:4000', {
      'reconnection delay': 0,
      'reopen delay': 0,
      'force new connection': true,
    });
    socket1.on('connect', function () {
      socket2 = io.connect('http://localhost:4000', {
        'reconnection delay': 0,
        'reopen delay': 0,
        'force new connection': true,
      });
      socket2.on('connect', function () {
        done();
      });
    });
  });

  it('connect to room', async () => {
    const room = await join(socket1, 'test');
    expect(room).toBeDefined();
  });

  it('should receive publish event', async (done) => {
    const room1 = await join(socket1, 'test');
    const room2 = await join(socket2, 'test');
    const unsubscribe1 = room1.subscribe('testevent', (params) => {
      expect(params).toEqual({ test: 'test' });
      done();
    });
    room2.publish('testevent', { test: 'test' });
  });

  it('should receive self published event', async (done) => {
    const room1 = await join(socket1, 'test');
    const unsubscribe1 = room1.subscribe('testevent', (params) => {
      expect(params).toEqual({ test: 'test' });
      done();
    });
    room1.publish('testevent', { test: 'test' }, true);
  });

  it('should call remote function', async () => {
    const room1 = await join(socket1, 'test');
    const room2 = await join(socket2, 'test');

    const unregister = room1.register('testrpc', (params) => {
      expect(params).toEqual({ test: 'test' });
      return 42;
    });
    const result = await room2.call('testrpc', { test: 'test' });

    expect(result).toBe(42);
  });
});
