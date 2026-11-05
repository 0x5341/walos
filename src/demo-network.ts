import type { WalosOptions } from '@walos/os';
import type { TailscaleSession, TailscaleStatus } from '@walos/tailscale-socket';

export type DemoNetwork = Pick<WalosOptions, 'sockets' | 'http'>;
function networkURL(name: string) {
  const path = import.meta.env.DEV
    ? `src/network/${name === 'tailscale-session' ? 'tailscale-session.worker' : name}.ts`
    : `network/${name}.js`;
  return new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;
}

export function setupNetwork(restart: (network?: DemoNetwork) => Promise<void>) {
  const login = document.querySelector<HTMLButtonElement>('#tailscale-login')!;
  const disconnect = document.querySelector<HTMLButtonElement>('#tailscale-disconnect')!;
  const use = document.querySelector<HTMLButtonElement>('#tailscale-use')!;
  const exits = document.querySelector<HTMLSelectElement>('#tailscale-exit')!;
  const auth = document.querySelector<HTMLAnchorElement>('#tailscale-auth')!;
  const key = document.querySelector<HTMLInputElement>('#tailscale-key')!;
  const control = document.querySelector<HTMLInputElement>('#tailscale-control')!;
  const state = document.querySelector<HTMLElement>('#network-state')!;
  let session: TailscaleSession | undefined;
  let status: TailscaleStatus | undefined;
  let busy = false;
  let applied = false;
  let polling = false;
  let closed = false;
  function render() {
    login.disabled = busy || Boolean(session);
    disconnect.disabled = busy || !session;
    key.disabled = control.disabled = busy || Boolean(session);
    exits.disabled = busy || !status || status.state !== 'Running';
    use.disabled = exits.disabled || !exits.value || Boolean(exits.selectedOptions[0]?.disabled);
    if (busy) return;
    if (!session) state.textContent = 'Disconnected · HTTP uses browser Fetch';
    else if (status?.state !== 'Running') state.textContent = status?.state ?? 'Logging in…';
    else if (applied)
      state.textContent = status.exitReady
        ? `Using exit node · ${status.addresses.join(', ')}`
        : 'Exit node unavailable · external traffic is blocked';
    else state.textContent = 'Logged in · select an exit node to use it';
  }
  function update(value: TailscaleStatus) {
    status = value;
    const selected = exits.value || value.exitNode;
    exits.replaceChildren(
      new Option(value.exitNodes.length ? 'Choose an exit node' : 'No exit nodes available', ''),
    );
    for (const node of value.exitNodes) {
      const option = new Option(`${node.name}${node.online ? '' : ' (offline)'}`, node.id);
      option.disabled = !node.online;
      exits.add(option);
    }
    exits.value = selected;
    if (value.state === 'Running') {
      auth.hidden = true;
      auth.removeAttribute('href');
    }
    render();
  }
  async function action(message: string, operation: () => Promise<void>) {
    if (busy || closed) return;
    busy = true;
    state.textContent = message;
    render();
    let error: unknown;
    try {
      await operation();
    } catch (cause) {
      error = cause;
    } finally {
      busy = false;
      render();
    }
    if (error)
      state.textContent = `Tailscale: ${error instanceof Error ? error.message : String(error)}`;
  }
  login.onclick = () =>
    void action('Starting Tailscale…', async () => {
      const authKey = key.value.trim();
      key.value = '';
      const { createTailscaleSession } = (await import(
        /* @vite-ignore */ networkURL('tailscale-client')
      )) as typeof import('@walos/tailscale-socket');
      const owner = await createTailscaleSession({
        worker: networkURL('tailscale-session'),
        hostname: 'walos-demo',
        authKey: authKey || undefined,
        controlURL: control.value.trim() || undefined,
        onEvent(event) {
          if (closed) return;
          if (event.type === 'status') update(event.status);
          else if (event.type === 'error') state.textContent = `Tailscale: ${event.message}`;
          else {
            const url = new URL(event.url);
            if (!['https:', 'http:'].includes(url.protocol)) return;
            auth.href = url.href;
            auth.hidden = false;
          }
        },
      });
      if (closed) {
        await owner[Symbol.asyncDispose]();
        return;
      }
      session = owner;
      try {
        if (!authKey) await owner.login();
        update(await owner.status());
      } catch (error) {
        session = undefined;
        await owner[Symbol.asyncDispose]();
        throw error;
      }
    });
  exits.onchange = render;
  use.onclick = () =>
    void action('Preparing exit node…', async () => {
      const owner = session!;
      await owner.selectExitNode(exits.value);
      const deadline = Date.now() + 30000;
      for (;;) {
        const value = await owner.status();
        update(value);
        if (value.exitReady) break;
        if (Date.now() >= deadline) throw new Error('Exit node did not become ready');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      state.textContent = 'Restarting Shell with Tailscale…';
      // Keep this mode on failure too: an unavailable exit must not enable Fetch.
      applied = true;
      await restart({
        sockets: owner.socketOptions(networkURL('tailscale-socket')),
        http: { transport: 'sockets', module: networkURL('http-transport') },
      });
    });
  disconnect.onclick = () =>
    void action('Disconnecting…', async () => {
      const owner = session!;
      // Close process connections before releasing the shared node.
      if (applied) await restart();
      await owner[Symbol.asyncDispose]();
      session = undefined;
      status = undefined;
      applied = false;
      auth.hidden = true;
      auth.removeAttribute('href');
      exits.replaceChildren(new Option('Log in to see exit nodes', ''));
    });
  const timer = setInterval(() => {
    const owner = session;
    if (!owner || polling || busy) return;
    polling = true;
    void owner
      .status()
      .then((value) => {
        if (session === owner && !closed) update(value);
      })
      .catch((error) => {
        if (!closed) state.textContent = `Tailscale: ${String(error)}`;
      })
      .finally(() => {
        polling = false;
      });
  }, 2000);
  window.addEventListener(
    'pagehide',
    () => {
      closed = true;
      clearInterval(timer);
      void Promise.resolve(session?.[Symbol.asyncDispose]()).catch(() => {});
    },
    { once: true },
  );
  render();
}
