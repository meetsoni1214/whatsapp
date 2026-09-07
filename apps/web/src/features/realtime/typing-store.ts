import { typingTiming, type TypingUpdatedFrame } from "@event-chat/contracts";

interface Entry {
  deadline: number;
  timer: ReturnType<typeof setTimeout>;
}

export function typingKey(conversationId: string, userId: string): string {
  return `${conversationId}:${userId}`;
}

export class TypingStore {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private snapshot: ReadonlySet<string> = new Set();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): ReadonlySet<string> => this.snapshot;

  update({
    conversationId,
    userId,
    isTyping,
  }: TypingUpdatedFrame["payload"]): void {
    const key = typingKey(conversationId, userId);
    const previous = this.entries.get(key);
    if (previous) {
      clearTimeout(previous.timer);
    }
    if (!isTyping) {
      if (this.entries.delete(key)) {
        this.publish();
      }
      return;
    }
    const entry: Entry = {
      deadline: performance.now() + typingTiming.expiryMs,
      timer: setTimeout(() => {
        if (this.entries.get(key) !== entry) {
          return;
        }
        this.entries.delete(key);
        this.publish();
      }, typingTiming.expiryMs),
    };
    this.entries.set(key, entry);
    if (!previous) {
      this.publish();
    }
  }

  prune(): void {
    let changed = false;
    for (const [key, entry] of this.entries) {
      if (entry.deadline <= performance.now()) {
        clearTimeout(entry.timer);
        this.entries.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.publish();
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
    }
    if (this.entries.size === 0) {
      return;
    }
    this.entries.clear();
    this.publish();
  }

  private publish(): void {
    this.snapshot = new Set(this.entries.keys());
    for (const listener of this.listeners) {
      listener();
    }
  }
}
