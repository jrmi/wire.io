import io from 'socket.io-client';
import join from './client';

const port = process.env.PORT || 4000;

describe('Client', () => {
  let socket1 = null;
  let socket2 = null;
  beforeEach((done) => {
    socket1 = io.connect(`http://localhost:${port}`, {
      'reconnection delay': 0,
      'reopen delay': 0,
      forceNew: true,
    });
    socket1.on('connect', function () {
      socket2 = io.connect(`http://localhost:${port}`, {
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
    const room = await join({ socket: socket1, room: 'test' });
    expect(room).toBeDefined();
    expect(room.userId).toBeDefined();
    expect(room.userId).not.toBe(null);
  });

  it('should receive published event', async (done) => {
    const room1 = await join({ socket: socket1, room: 'test' });
    const room2 = await join({ socket: socket2, room: 'test' });
    room1.subscribe('testevent', (params) => {
      expect(params).toEqual({ test: 'test' });
      done();
    });
    room2.publish('testevent', { test: 'test' });
  });

  it('should not receive published event if unsubcribed', async () => {
    const room1 = await join({ socket: socket1, room: 'test' });
    const room2 = await join({ socket: socket2, room: 'test' });

    const callback = jest.fn();
    const unsubscribe = room1.subscribe('testevent', callback);
    unsubscribe();

    room2.publish('testevent', { test: 'test' });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should receive incoming user event', async (done) => {
    const room1 = await join({ socket: socket1, room: 'test' });

    room1.subscribe('userEnter', (params) => {
      expect(params).toBeDefined();
      done();
    });

    const room2 = await join({ socket: socket2, room: 'test' });
  });

  it('should receive user leave event', async (done) => {
    const room1 = await join({ socket: socket1, room: 'test' });
    room1.subscribe('userLeave', (params) => {
      expect(params).toBeDefined();
      done();
    });

    const room2 = await join({ socket: socket2, room: 'test' });
    socket2.disconnect();
  });

  it('should receive self published event', async (done) => {
    const room1 = await join({ socket: socket1, room: 'test' });
    room1.subscribe('testevent', (params) => {
      expect(params).toEqual({ test: 'test' });
      done();
    });
    room1.publish('testevent', { test: 'test' }, true);
  });

  it('should call remote function', async () => {
    const room1 = await join({ socket: socket1, room: 'test' });
    const room2 = await join({ socket: socket2, room: 'test' });

    await room1.register('testrpc', (params) => {
      expect(params).toEqual({ test: 'testa' });
      return { answer: 42 };
    });

    const result = await room2.call('testrpc', { test: 'testa' });

    expect(result).toEqual({ answer: 42 });
  });

  it('should call remote async function', async () => {
    const room1 = await join({ socket: socket1, room: 'test' });
    const room2 = await join({ socket: socket2, room: 'test' });

    await room1.register('testrpc', async (params) => {
      expect(params).toEqual({ test: 'testa' });
      return { answer: 42 };
    });

    const result = await room2.call('testrpc', { test: 'testa' });

    expect(result).toEqual({ answer: 42 });
  });

  it('should unregister/register remote function', async () => {
    const room1 = await join({ socket: socket1, room: 'test' });
    const room2 = await join({ socket: socket2, room: 'test' });

    const firstCallback = jest.fn();

    const unregister = await room1.register('testrpcwithunreg', firstCallback);

    await unregister();

    try {
      await room2.call('testrpcwithunreg', { test: 'test0' });
    } catch (err) {
      expect(err).toBe('Function testrpcwithunreg is not registered');
    }

    await room1.register('testrpcwithunreg', (params) => {
      return 42;
    });

    const result = await room2.call('testrpcwithunreg', { test: 'test1' });

    expect(result).toBe(42);

    expect(firstCallback).not.toHaveBeenCalled();
  });

  it('should not call not registered remote function', async (done) => {
    const room2 = await join({ socket: socket2, room: 'test' });

    try {
      await room2.call('testrpc', { test: 'testbis' });
    } catch (err) {
      expect(err).toBe('Function testrpc is not registered');
      done();
    }
  });

  it('should call remote function with exception', async (done) => {
    const room1 = await join({ socket: socket1, room: 'test' });
    const room2 = await join({ socket: socket2, room: 'test' });

    await room1.register('testrpc', (params) => {
      throw new Error('test error');
    });
    try {
      await room2.call('testrpc', { test: 'testerror' });
    } catch (err) {
      expect(err).toBe('Error: test error');
      done();
    }
  });

  it('should call onMaster callback', async (done) => {
    const onMaster1 = jest.fn();
    const onMaster2 = jest.fn();

    const room1 = await join({
      socket: socket1,
      room: 'test',
      onMaster: onMaster1,
    });
    const room2 = await join({
      socket: socket2,
      room: 'test',
      onMaster: onMaster2,
    });

    expect(onMaster1).toHaveBeenCalled();
    expect(onMaster2).not.toHaveBeenCalled();

    socket1.disconnect();

    // Hard wait as there is no way to wait for server to finish is work
    setTimeout(() => {
      expect(onMaster2).toHaveBeenCalled();
      done();
    }, 200);
  });

  it('should call onJoin callback', async () => {
    const onJoin1 = jest.fn();

    const s = await join({
      socket: socket1,
      room: 'test',
      onJoined: onJoin1,
    });

    expect(onJoin1).toHaveBeenCalled();
  });

  it('should force userId', async () => {
    const onJoin1 = jest.fn();

    const s = await join({
      socket: socket1,
      room: 'test',
      onJoined: onJoin1,
      userId: 'testid',
    });

    expect(onJoin1.mock.calls[0][0].userId).toBe('testid');
  });
});
