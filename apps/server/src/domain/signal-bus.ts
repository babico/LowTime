import type { RoomSlug, RoomSummary, ChatMessage } from "@lowtime/shared";

/**
 * Discriminated union of every server-to-client event the signaling
 * backbone can emit. Kept in one place so the routes, tests, and future
 * web-side subscribers agree on the wire shape.
 */
export type SignalServerEvent =
  | { kind: "room.snapshot"; room: RoomSummary }
  | { kind: "room.settings_updated"; room: RoomSummary }
  | { kind: "transport.switch_available"; nextTransport: "p2p" }
  | { kind: "chat.received"; message: ChatMessage }
  | { kind: "error"; code: string; message: string };

export type SignalHandler = (event: SignalServerEvent) => void;

export interface SignalBus {
  /** Subscribe to events for a single slug. Returns an unsubscribe fn. */
  subscribe(slug: RoomSlug, handler: SignalHandler): () => void;
  /**
   * Publish one event to every currently-subscribed handler for the slug.
   * Handler throws are caught and logged by the caller's logger; they do
   * not stop later handlers from firing. No-op when no subscribers exist.
   */
  publish(slug: RoomSlug, event: SignalServerEvent): void;
}

interface SignalBusLogger {
  error(payload: unknown, message?: string): void;
}

export function createInMemorySignalBus(logger?: SignalBusLogger): SignalBus {
  const subscribers = new Map<RoomSlug, Set<SignalHandler>>();

  return {
    subscribe(slug, handler) {
      let set = subscribers.get(slug);
      if (set == null) {
        set = new Set();
        subscribers.set(slug, set);
      }
      set.add(handler);
      return () => {
        const current = subscribers.get(slug);
        if (current == null) return;
        current.delete(handler);
        if (current.size === 0) {
          subscribers.delete(slug);
        }
      };
    },
    publish(slug, event) {
      const set = subscribers.get(slug);
      if (set == null || set.size === 0) {
        return;
      }
      // Snapshot so a handler that subscribes/unsubscribes during dispatch
      // does not mutate the iteration target.
      const snapshot = [...set];
      for (const handler of snapshot) {
        try {
          handler(event);
        } catch (error) {
          logger?.error(
            {
              event: "signal_bus",
              action: "handler_throw",
              slug,
              message: error instanceof Error ? error.message : String(error),
            },
            "signal handler threw",
          );
        }
      }
    },
  };
}
