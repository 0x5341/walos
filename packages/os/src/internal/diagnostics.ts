// Experimental diagnostics, deliberately separate from WalosOptions/WalosEvent.
// No recording or extra messages on the normal execution path.
export interface TimelineEvent {
  name: string;
  at: number;
  origin: number;
  pid: number;
  commandId: number;
  detail?: Record<string, unknown>;
}
export interface DiagnosticConfig {
  detailed: boolean;
  commandId: number;
}
export class Timeline {
  events: TimelineEvent[] = [];
  constructor(
    public config: DiagnosticConfig,
    public pid: number,
  ) {}
  mark(
    name: string,
    detail?: Record<string, unknown>,
    commandId = this.config.commandId,
    pid = this.pid,
  ) {
    if (!this.config.detailed) return;
    const event: TimelineEvent = {
      name,
      at: performance.timeOrigin + performance.now(),
      origin: performance.timeOrigin,
      pid,
      commandId,
      ...(detail && { detail }),
    };
    this.events.push(event);
    return event;
  }
  drain() {
    return this.events.splice(0);
  }
}
let timeline: Timeline | undefined;
export const getTimeline = () => timeline;
/** Preserve the original promise path when detailed recording is disabled. */
export function traceOperation<T>(
  operation: string,
  path: string,
  run: () => Promise<T>,
): Promise<T> {
  const trace = timeline;
  if (!trace?.config.detailed) return run();
  const start = trace.mark('opfs.operation.start', { operation, path });
  return run().finally(() =>
    trace.mark('opfs.operation.end', { operation, path, startAt: start!.at }),
  );
}
export function configureTimeline(config: DiagnosticConfig, pid: number) {
  return (timeline = new Timeline(config, pid));
}
export interface PromptMarker {
  commandId: number;
  status: number;
  promptBytes: number;
  events: TimelineEvent[];
}
export class SessionDiagnostics extends Timeline {
  onPrompt?: (marker: PromptMarker) => void;
  send?: (message: unknown) => void;
  private pending?: (events: TimelineEvent[]) => void;
  collect(): Promise<TimelineEvent[]> {
    if (this.pending) throw new Error('Diagnostics collection already pending');
    return new Promise((resolve) => {
      this.pending = resolve;
      this.send?.({ type: 'diagnostics' });
    });
  }
  collected(events: TimelineEvent[]) {
    this.events.push(...events);
    this.pending?.(this.drain());
    this.pending = undefined;
  }
}
const sessions = new WeakMap<object, SessionDiagnostics>();
/** Attach before boot. Correlation remains enabled when detailed recording is off. */
export function attachDiagnostics(session: object, detailed = true): SessionDiagnostics {
  if (sessions.has(session)) throw new Error('Diagnostics already attached');
  const diagnostics = new SessionDiagnostics({ detailed, commandId: 0 }, 0);
  sessions.set(session, diagnostics);
  return diagnostics;
}
export const sessionDiagnostics = (session: object) => sessions.get(session);
