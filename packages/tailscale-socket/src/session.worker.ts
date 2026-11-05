import { SessionBroker } from './broker.js';
import { loadTailscaleRuntime } from './runtime.js';
const scope = self as unknown as { onconnect: (event: MessageEvent) => void; close(): void };
const broker = new SessionBroker(loadTailscaleRuntime, () => scope.close());
scope.onconnect = (event) => {
  for (const port of event.ports) broker.connect(port);
};
