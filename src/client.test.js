import io from 'socket.io-client';
import join from './client';

describe('Client', () => {
  let socket1 = null;
  let socket2 = null;
  beforeEach((done) => {
    socket1 = io.connect('http://localhost:4000', {
      'reconnection delay': 0,
      'reopen delay': 0,
      forceNew: true,
    });
    socket1.on('connect', function () {
      socket2 = io.connect('http://localhost:4000', {
        'reconnection delay': 0,
        'reopen delay': 0,
        forceNew: true,
      });
      socket2.on('connect', function () {
        done();
      });
    });
  });

  afterEach(function (done) {
    // Cleanup
    if (socket1.connected) {
      socket1.disconnect();
    }
    if (socket2.connected) {
      socket2.disconnect();
    }
    done();
  });

  it('connect to room', async () => {
    const room = await join(socket1, 'test');
    expect(room).toBeDefined();
  });

  it('should receive published event', async (done) => {
    const room1 = await join(socket1, 'test');
    const room2 = await join(socket2, 'test');
    room1.subscribe('testevent', (params) => {
      expect(params).toEqual({ test: 'test' });
      done();
    });
    room2.publish('testevent', { test: 'test' });
  });

  it('should not receive published event if unscribed', async () => {
    const room1 = await join(socket1, 'test');
    const room2 = await join(socket2, 'test');

    const callback = jest.fn();
    const unsubscribe = room1.subscribe('testevent', callback);
    unsubscribe();

    room2.publish('testevent', { test: 'test' });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should receive self published event', async (done) => {
    const room1 = await join(socket1, 'test');
    room1.subscribe('testevent', (params) => {
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

  it('should unregister remote function', async (done) => {
    const room1 = await join(socket1, 'test');
    const room2 = await join(socket2, 'test');

    const unregister = room1.register('testrpc', (params) => {
      return 42;
    });

    await unregister();

    try {
      await room2.call('testrpc', { test: 'test' });
    } catch (err) {
      expect(err).toBe('Function testrpc is not registered');
      done();
    }
  });

  it('should not call not registered remote function', async (done) => {
    const room2 = await join(socket2, 'test');

    try {
      await room2.call('testrpc', { test: 'test' });
    } catch (err) {
      expect(err).toBe('Function testrpc is not registered');
      done();
    }
  });

  it('should call remote function with exception', async (done) => {
    const room1 = await join(socket1, 'test');
    const room2 = await join(socket2, 'test');

    const unregister = room1.register('testrpc', (params) => {
      throw new Error('test error');
    });
    try {
      await room2.call('testrpc', { test: 'test' });
    } catch (err) {
      expect(err).toBe('Error: test error');
      done();
    }
  });
});
