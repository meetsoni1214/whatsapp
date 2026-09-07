import { typingTiming } from '@event-chat/contracts';
import { TypingService, type TypingUpdate } from './typing.service';
import type { RealtimeConnection } from './realtime-connections.service';

function connection(userId = 'alice'): RealtimeConnection {
  return { user: { id: userId, username: userId } } as RealtimeConnection;
}

describe('TypingService', () => {
  let service: TypingService;
  let emit: jest.MockedFunction<(update: TypingUpdate) => void>;
  beforeEach(() => {
    jest.useFakeTimers();
    service = new TypingService();
    emit = jest.fn();
    service.subscribe(emit);
  });
  afterEach(() => {
    service.shutdown();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('renews a lease and ignores a stale expiry callback', () => {
    const timers = jest.spyOn(global, 'setTimeout');
    const alice = connection();
    service.refresh(alice, 'chat', ['bob']);
    const oldExpiry = timers.mock.calls[0][0];
    jest.advanceTimersByTime(4_000);
    service.refresh(alice, 'chat', ['bob']);
    oldExpiry();
    jest.advanceTimersByTime(1_000);
    expect(emit.mock.calls.map(([update]) => update.payload.isTyping)).toEqual([
      true,
      true,
    ]);
    jest.advanceTimersByTime(4_000);
    expect(emit).toHaveBeenLastCalledWith({
      payload: { conversationId: 'chat', userId: 'alice', isTyping: false },
      peerIds: ['bob'],
    });
  });

  it('keeps another tab active and makes repeated stops harmless', () => {
    const first = connection();
    const second = connection();
    service.refresh(first, 'chat', ['bob']);
    service.refresh(second, 'chat', ['bob']);
    emit.mockClear();
    service.stop(first, 'chat');
    service.disconnect(first);
    expect(emit).not.toHaveBeenCalled();
    service.stop(second, 'chat');
    service.stop(second, 'chat');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].payload.isTyping).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('expires simultaneous leases with a single user-level stop', () => {
    service.refresh(connection(), 'chat', ['bob']);
    service.refresh(connection(), 'chat', ['bob']);
    emit.mockClear();
    jest.advanceTimersByTime(typingTiming.expiryMs);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].payload.isTyping).toBe(false);
  });

  it('does not clear a later lease when another tab expires', () => {
    service.refresh(connection(), 'chat', ['bob']);
    jest.advanceTimersByTime(2_000);
    service.refresh(connection(), 'chat', ['bob']);
    emit.mockClear();
    jest.advanceTimersByTime(3_000);
    expect(emit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('disconnects all chats for one connection without affecting other users or chats', () => {
    const alice = connection();
    const otherAlice = connection();
    const bob = connection('bob');
    service.refresh(alice, 'ab', ['bob']);
    service.refresh(alice, 'ac', ['charlie']);
    service.refresh(otherAlice, 'ac', ['charlie']);
    service.refresh(bob, 'ab', ['alice']);
    emit.mockClear();
    service.disconnect(alice);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      payload: { conversationId: 'ab', userId: 'alice', isTyping: false },
      peerIds: ['bob'],
    });
    expect(jest.getTimerCount()).toBe(2);
  });

  it('unsubscribes listeners and cancels all leases on shutdown', () => {
    const unsubscribed = jest.fn();
    service.subscribe(unsubscribed)();
    const alice = connection();
    service.refresh(alice, 'chat', ['bob']);
    expect(unsubscribed).not.toHaveBeenCalled();
    service.shutdown();
    emit.mockClear();
    service.refresh(alice, 'chat', ['bob']);
    jest.advanceTimersByTime(10_000);
    expect(emit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
