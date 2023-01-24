import { jest } from '@jest/globals';
import io from 'socket.io-client';
import joinWire from './client';
import retry from 'retry-assert';

const port = process.env.PORT || 4000;

describe('Client', () => {
  let socket1 = null;
  let socket2 = null;
  let socket3 = null;
  beforeEach((done) => {
    socket1 = io.connect(`http://localhost:${port}`, {
      'reconnection delay': 0,
      'reopen delay': 0,
      forceNew: true,
    });
    socket1.on('connect', () => {
      socket2 = io.connect(`http://localhost:${port}`, {
        'reconnection delay': 0,
        'reopen delay': 0,
        forceNew: true,
      });
      socket2.on('connect', () => {
        socket3 = io.connect(`http://localhost:${port}`, {
          'reconnection delay': 0,
          'reopen delay': 0,
          forceNew: true,
        });
        socket3.on('connect', function () {
          done();
        });
      });
    });
  });

  afterEach(async () => {
    const disco = () => {
      // Cleanup
      if (socket1 && socket1.connected) {
        socket1.disconnect();
        return false;
      }
      if (socket2 && socket2.connected) {
        socket2.disconnect();
        return false;
      }
      if (socket3 && socket3.connected) {
        socket3.disconnect();
        return false;
      }
      return true;
    };

    await retry(disco).withTimeout(3000).untilTruthy();
  });

  it('connect to room', async () => {
    const room = await joinWire({ socket: socket1, room: 'test' });
    expect(room).toBeDefined();
    expect(room.userId).toBeDefined();
    expect(room.userId).not.toBe(null);
  });

  it('should receive published event', async (done) => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });
    room1.subscribe('testevent', (params) => {
      expect(params).toEqual({ test: 'test' });
      done();
    });
    room2.publish('testevent', { test: 'test' });
  });

  it('should not receive published event if unsubscribed', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });

    const callback = jest.fn();
    const unsubscribe = room1.subscribe('testevent', callback);
    unsubscribe();

    room2.publish('testevent', { test: 'test' });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should receive incoming user event', async (done) => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });

    room1.subscribe('userEnter', (params) => {
      expect(params).toBeDefined();
      done();
    });

    const room2 = await joinWire({ socket: socket2, room: 'test' });
  });

  it('should receive user leave event', async (done) => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    room1.subscribe('userLeave', (params) => {
      expect(params).toBeDefined();
      done();
    });

    const room2 = await joinWire({ socket: socket2, room: 'test' });
    socket2.disconnect();
  });

  it('should receive self published event', async (done) => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    room1.subscribe('testevent', (params) => {
      expect(params).toEqual({ test: 'test' });
      done();
    });
    room1.publish('testevent', { test: 'test' }, true);
  });

  it('should call remote single function', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });

    await room1.register('testrpc', (params) => {
      expect(params).toEqual({ test: 'testa' });
      return { answer: 42 };
    });

    const result = await room2.call('testrpc', { test: 'testa' });

    expect(result).toEqual({ answer: 42 });
  });

  it('should call remote single async function', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });

    await room1.register('testrpc', async (params) => {
      expect(params).toEqual({ test: 'testa' });
      return { answer: 42 };
    });

    const result = await room2.call('testrpc', { test: 'testa' });

    expect(result).toEqual({ answer: 42 });
  });

  it('should unregister/register single remote function', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });

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

  it('should not call not registered single remote function', async (done) => {
    const room2 = await joinWire({ socket: socket2, room: 'test' });

    try {
      await room2.call('testrpc', { test: 'testbis' });
    } catch (err) {
      expect(err).toBe('Function testrpc is not registered');
      done();
    }
  });

  it('should call single remote function with exception', async (done) => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });

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

  it('should call remote first function', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });
    const room3 = await joinWire({ socket: socket3, room: 'test' });

    await room1.register(
      'testrpc',
      (params) => {
        return { answer: 42 };
      },
      { invoke: 'first' }
    );

    const unregister = await room2.register(
      'testrpc',
      (params) => {
        return { answer: 43 };
      },
      { invoke: 'first' }
    );

    let result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 42 });

    await room1.register(
      'testrpc',
      (params) => {
        return { answer: 44 };
      },
      { invoke: 'first' }
    );

    result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 43 });

    await unregister();

    result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 44 });

    room1.leave();

    await expect(() =>
      retry(() => room3.call('testrpc'))
        .withTimeout(1000)
        .until((result) => expect(result).toEqual({}))
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('should call remote last function', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });
    const room3 = await joinWire({ socket: socket3, room: 'test' });

    await room1.register(
      'testrpc',
      (params) => {
        return { answer: 42 };
      },
      { invoke: 'last' }
    );

    const unregister = await room2.register(
      'testrpc',
      (params) => {
        return { answer: 43 };
      },
      { invoke: 'last' }
    );

    let result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 43 });

    await room1.register(
      'testrpc',
      (params) => {
        return { answer: 44 };
      },
      { invoke: 'last' }
    );

    result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 44 });

    await unregister();

    result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 44 });

    room1.leave();

    await expect(() =>
      retry(() => room3.call('testrpc'))
        .withTimeout(1000)
        .until((result) => expect(result).toEqual({}))
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('should call remote random function', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });
    const room3 = await joinWire({ socket: socket3, room: 'test' });

    await room1.register(
      'testrpc',
      (params) => {
        return { answer: 42 };
      },
      { invoke: 'random' }
    );

    const unregister = await room2.register(
      'testrpc',
      (params) => {
        return { answer: 42 };
      },
      { invoke: 'random' }
    );

    let result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 42 });

    await room1.register(
      'testrpc',
      (params) => {
        return { answer: 42 };
      },
      { invoke: 'random' }
    );

    result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 42 });

    await unregister();

    result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 42 });

    room1.leave();

    await expect(() =>
      retry(() => room3.call('testrpc'))
        .withTimeout(1000)
        .until((result) => expect(result).toEqual({}))
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('should not be able to register different function type', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });
    const room3 = await joinWire({ socket: socket3, room: 'test' });

    const unregister1 = await room1.register(
      'testrpc',
      (params) => {
        return { answer: 42 };
      },
      { invoke: 'last' }
    );

    await expect(
      room2.register(
        'testrpc',
        (params) => {
          return { answer: 43 };
        },
        { invoke: 'first' }
      )
    ).rejects.toThrowErrorMatchingSnapshot();

    await unregister1();

    await room1.register('testrpc', (params) => {
      return { answer: 46 };
    });

    let result = await room3.call('testrpc');
    expect(result).toEqual({ answer: 46 });

    await expect(
      room1.register('testrpc', (params) => {
        return { answer: 47 };
      })
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('should call onMaster callback on leave and disconnect', async () => {
    const onMaster1 = jest.fn();
    const onMaster2 = jest.fn();
    const onMaster3 = jest.fn();

    const room1 = await joinWire({
      socket: socket1,
      room: 'test',
      onMaster: onMaster1,
    });
    const room2 = await joinWire({
      socket: socket2,
      room: 'test',
      onMaster: onMaster2,
    });
    const room3 = await joinWire({
      socket: socket3,
      room: 'test',
      onMaster: onMaster3,
    });

    await retry(() => onMaster1)
      .withTimeout(1000)
      .until((onMasterCallback) => expect(onMasterCallback).toHaveBeenCalled());

    expect(onMaster2).not.toHaveBeenCalled();
    expect(onMaster3).not.toHaveBeenCalled();

    // Leave first
    room1.leave();

    await retry(() => onMaster2)
      .withTimeout(1000)
      .until((onMasterCallback) => expect(onMasterCallback).toHaveBeenCalled());

    expect(onMaster3).not.toHaveBeenCalled();

    // Then disconnect
    socket2.disconnect();

    await retry(() => onMaster3)
      .withTimeout(1000)
      .until((onMasterCallback) => expect(onMasterCallback).toHaveBeenCalled());
  });

  it('should call onJoin callback', async () => {
    const onJoin1 = jest.fn();

    const s = await joinWire({
      socket: socket1,
      room: 'test',
      onJoined: onJoin1,
    });

    expect(onJoin1).toHaveBeenCalled();
  });

  it('should force userId', async () => {
    const onJoin1 = jest.fn();

    const s = await joinWire({
      socket: socket1,
      room: 'test',
      onJoined: onJoin1,
      userId: 'testid',
    });

    expect(onJoin1.mock.calls[0][0].userId).toBe('testid');
  });

  it('should receive published event only on same room', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });
    const room3 = await joinWire({ socket: socket3, room: 'test2' });

    const callback = jest.fn();
    room1.subscribe('testevent', callback);

    const callback2 = jest.fn();
    room3.subscribe('testevent', callback2);

    room2.publish('testevent', { test: 'test' });

    await retry(() => callback.mock.calls.length === 1)
      .withTimeout(2000)
      .untilTruthy();

    await retry(() => callback2.mock.calls.length === 0)
      .withTimeout(2000)
      .ensureTruthy();
  });

  it('should not receive published event if room is left', async () => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });
    const room3 = await joinWire({ socket: socket3, room: 'test' });

    const callback = jest.fn();
    room1.subscribe('testevent', callback);

    const callback2 = jest.fn();
    room3.subscribe('testevent', callback2);

    room2.publish('testevent', { test: 'test' });

    await retry(() => callback.mock.calls.length === 1)
      .withTimeout(2000)
      .untilTruthy();

    await retry(() => callback2.mock.calls.length === 1)
      .withTimeout(2000)
      .untilTruthy();

    room3.leave();

    room2.publish('testevent', { test: 'test' });

    await retry(() => callback.mock.calls.length === 2)
      .withTimeout(2000)
      .untilTruthy();

    await retry(() => callback2.mock.calls.length === 1)
      .withTimeout(2000)
      .ensureTruthy();
  });

  it('should call remote async function only in same room', async (done) => {
    const room1 = await joinWire({ socket: socket1, room: 'test' });
    const room2 = await joinWire({ socket: socket2, room: 'test' });
    const room3 = await joinWire({ socket: socket2, room: 'test3' });

    await room1.register('testrpc', async (params) => {
      expect(params).toEqual({ test: 'testa' });
      return { answer: 42 };
    });

    const result = await room2.call('testrpc', { test: 'testa' });

    expect(result).toEqual({ answer: 42 });

    try {
      await room3.call('testrpc', { toto: 42 });
    } catch (err) {
      expect(err).toBe('Function testrpc is not registered');
      done();
    }
  });
});
