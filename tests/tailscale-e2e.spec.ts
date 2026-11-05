import { test, expect } from '@playwright/test';
// Local DERP uses a self-signed test certificate, including inside SharedWorker.
test.use({
  ignoreHTTPSErrors: true,
  launchOptions: { args: ['--no-sandbox', '--ignore-certificate-errors'] },
});
test.skip(!process.env.WALOS_TEST_CONTROL, 'requires local Go control/DERP/exit-node harness');
test('real browser Tailscale node sends through an exit node and receives HTTP on its tailnet address', async ({
  page,
}) => {
  test.setTimeout(90000);
  page.on('console', (message) => {
    if (message.text().startsWith('tailscale-e2e')) console.log(message.text());
  });
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async (controlURL) => {
    const { createTailscaleSession } = await import('/packages/tailscale-socket/dist/index.js');
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const session = await createTailscaleSession({
      controlURL,
      authKey: 'test-key',
      hostname: 'walos-browser',
    });
    let os: InstanceType<typeof Walos> | undefined;
    try {
      const wait = async (
        predicate: (value: Awaited<ReturnType<typeof session.status>>) => boolean,
      ) => {
        const deadline = Date.now() + 30000;
        for (;;) {
          const status = await session.status();
          if (predicate(status)) return status;
          if (Date.now() > deadline)
            throw new Error(`Tailscale readiness timed out: ${JSON.stringify(status)}`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      };
      console.log('tailscale-e2e waiting for login');
      const status = await wait(
        (status) => status.state === 'Running' && status.exitNodes.length > 0,
      );
      console.log('tailscale-e2e logged in');
      await session.selectExitNode(status.exitNodes[0].id);
      await wait((status) => status.exitReady);
      console.log('tailscale-e2e exit ready');
      os = await Walos.create({
        storage: await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('tailscale-e2e', { create: true }),
        sockets: session.socketOptions(
          new URL('/packages/tailscale-socket/dist/index.js', location.href).href,
        ),
        http: {
          transport: 'sockets',
          module: new URL('/packages/http-transport/dist/index.js', location.href).href,
        },
      });
      console.log('tailscale-e2e OS ready');
      const host = new HostProcessContext(os.getHostProcess());
      const { Future } = await import('/packages/os/dist/index.js');
      const http = host.context.wasi.http;
      const [diagnostic] = http.types.request.new(
        http.types.fields.new(),
        undefined,
        new Future({ tag: 'ok', val: undefined }),
        undefined,
      );
      diagnostic.setScheme({ tag: 'HTTP' });
      diagnostic.setAuthority('203.0.113.42');
      const reply = await http.client.send(diagnostic);
      console.log('tailscale-e2e Host request', reply.tag === 'err' ? JSON.stringify(reply) : 'ok');
      if (reply.tag === 'err') throw new Error(JSON.stringify(reply));
      const [body] = http.types.response.consumeBody(
        reply.val,
        new Future({ tag: 'ok', val: undefined }),
      );
      while (await body.read(65536)) {}
      const sockets = host.context.wasi.sockets;
      const lookup = await sockets.ipNameLookup.resolveAddresses('external.walos.test');
      if (lookup.tag === 'err') throw new Error(JSON.stringify(lookup));
      const udpResult = sockets.types.udpSocket.create('ipv4');
      if (udpResult.tag === 'err') throw new Error(JSON.stringify(udpResult));
      const udp = udpResult.val;
      const bound = udp.bind({ tag: 'ipv4', val: { address: [0, 0, 0, 0], port: 0 } });
      if (bound.tag === 'err') throw new Error(JSON.stringify(bound));
      udp.connect({ tag: 'ipv4', val: { address: [203, 0, 113, 42], port: 9001 } });
      const sent = await udp.send(new Uint8Array(), undefined);
      if (sent.tag === 'err') throw new Error(JSON.stringify(sent));
      const packet = await udp.receive();
      if (packet.tag === 'err' || packet.val[0].length !== 0)
        throw new Error('UDP empty packet failed');
      await udp[Symbol.asyncDispose]();
      const ipv6 = sockets.types.udpSocket.create('ipv6');
      if (ipv6.tag === 'err') throw new Error(JSON.stringify(ipv6));
      const udp6 = ipv6.val;
      const connected6 = udp6.connect({
        tag: 'ipv6',
        val: { address: [0x2001, 0xdb8, 0, 0, 0, 0, 0, 0x42], port: 9001, scopeId: 0, flowInfo: 0 },
      });
      if (connected6.tag === 'err') throw new Error(JSON.stringify(connected6));
      const sent6 = await udp6.send(new Uint8Array([6]), undefined);
      if (sent6.tag === 'err') throw new Error(JSON.stringify(sent6));
      const packet6 = await udp6.receive();
      if (packet6.tag === 'err' || packet6.val[0][0] !== 6) throw new Error('IPv6 UDP failed');
      await udp6[Symbol.asyncDispose]();
      console.log('tailscale-e2e DNS and UDP passed');
      const outgoing = await run(host, await install(host, 'p3-probe'), [
        'p3-probe',
        'http',
        'external.walos.test',
      ]);
      console.log('tailscale-e2e outgoing', JSON.stringify(outgoing));
      if (outgoing.exit.kind !== 'exited' || outgoing.exit.code !== 0)
        throw new Error(JSON.stringify(outgoing));
      const curl = await run(host, await install(host, 'curl'), [
        'curl',
        'http://external.walos.test/',
      ]);
      if (
        curl.exit.kind !== 'exited' ||
        curl.exit.code !== 0 ||
        curl.stdout !== 'p3-http' ||
        curl.stderr
      )
        throw new Error(`curl through exit failed: ${JSON.stringify(curl)}`);
      const forwards = await (await fetch(`${controlURL}/test/forward-count`)).text();
      await session.selectExitNode('');
      const [deniedRequest] = http.types.request.new(
        http.types.fields.new(),
        undefined,
        new Future({ tag: 'ok', val: undefined }),
        undefined,
      );
      deniedRequest.setScheme({ tag: 'HTTP' });
      deniedRequest.setAuthority('203.0.113.42');
      const denied = await http.client.send(deniedRequest);
      if (denied.tag !== 'err' || denied.val.tag !== 'connection-terminated')
        throw new Error(`Missing exit was not denied: ${JSON.stringify(denied)}`);
      if ((await (await fetch(`${controlURL}/test/forward-count`)).text()) !== forwards)
        throw new Error('Traffic forwarded without selected exit');
      const service = await host.http.start(await install(host, 'p3-http-service'));
      const address = status.addresses
        .find((ip) => !ip.includes(':'))!
        .split('.')
        .map(Number) as [number, number, number, number];
      const bridge = await host.http.expose(service, {
        address: { tag: 'ipv4', val: { address, port: 0 } },
      });
      console.log('tailscale-e2e ingress ready', JSON.stringify(bridge.address));
      const response = await fetch(
        `${controlURL}/test/probe?address=${address.join('.')}:${bridge.address.val.port}`,
      );
      const incoming = await response.text();
      await service.requestStop();
      await service.wait();
      const stopped = await fetch(
        `${controlURL}/test/probe?address=${address.join('.')}:${bridge.address.val.port}`,
      );
      if (stopped.status !== 502 || !(await stopped.text()).includes('refused'))
        throw new Error('Service stop left ingress listening');
      await bridge[Symbol.asyncDispose]();
      return { outgoing, incoming, status: response.status };
    } finally {
      console.log('tailscale-e2e cleanup');
      await os?.dispose();
      await session[Symbol.asyncDispose]();
    }
  }, process.env.WALOS_TEST_CONTROL!);
  expect(result.outgoing).toMatchObject({
    exit: { kind: 'exited', code: 0 },
    stdout: 'p3-http-ok\n',
  });
  expect(result.status).toBe(200);
  expect(result.incoming).toBe('from-tailnet');
});

test('Demo logs in, applies an exit node and runs curl from the Shell without losing files', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  const input = page.getByLabel('Terminal input');
  const log = page.getByRole('log');
  await expect(input).toBeEnabled({ timeout: 30000 });
  const command = async (line: string) => {
    const offset = (await log.textContent())!.length;
    await input.fill(line);
    await input.press('Enter');
    await expect
      .poll(async () => (await log.textContent())!.slice(offset).endsWith('/ $ '))
      .toBe(true);
    return (await log.textContent())!.slice(offset);
  };
  await command('echo saved-before-tailscale > /home/network-note');
  await page.locator('#tailscale-options summary').click();
  await page.getByLabel('Auth key (optional)').fill('test-key');
  await page.getByLabel('Control server URL (optional)').fill(process.env.WALOS_TEST_CONTROL!);
  await page.getByRole('button', { name: 'Log in to Tailscale' }).click();
  await expect(page.locator('#network-state')).toContainText('Logged in', { timeout: 30000 });
  await expect(page.getByLabel('Auth key (optional)')).toHaveValue('');
  await expect.poll(() => page.locator('#tailscale-exit option').count()).toBeGreaterThan(1);
  const exit = await page.locator('#tailscale-exit option').nth(1).getAttribute('value');
  await page.getByLabel('Exit node', { exact: true }).selectOption(exit!);
  await page.getByRole('button', { name: 'Use exit node', exact: true }).click();
  await expect(page.locator('#network-state')).toContainText('Using exit node', { timeout: 30000 });
  expect(await command('curl http://external.walos.test/')).toContain('\np3-http');
  expect(await command('cat /home/network-note')).toContain('\nsaved-before-tailscale\n');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.locator('#network-state')).toContainText('Disconnected', { timeout: 30000 });
  expect(await command('cat /home/network-note')).toContain('\nsaved-before-tailscale\n');
});

test('Demo shows the interactive login link and observes approval', async ({ page }) => {
  await page.goto('/');
  await page.locator('#tailscale-options summary').click();
  await page.getByLabel('Control server URL (optional)').fill(process.env.WALOS_TEST_INTERACTIVE!);
  await page.getByRole('button', { name: 'Log in to Tailscale' }).click();
  const link = page.getByRole('link', { name: 'Open Tailscale login' });
  await expect(link).toBeVisible({ timeout: 30000 });
  const target = await link.getAttribute('href');
  expect(target).toContain('/auth/');
  const response = await page.request.get(target!);
  expect(response.ok()).toBe(true);
  await expect(page.locator('#network-state')).toContainText('Logged in', { timeout: 30000 });
  await expect(link).toBeHidden();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.locator('#network-state')).toContainText('Disconnected');
});

test('real interactive login emits an auth URL and finishes after approval', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async (controlURL) => {
    const { createTailscaleSession } = await import('/packages/tailscale-socket/dist/index.js');
    let auth!: (url: string) => void;
    const url = new Promise<string>((resolve) => {
      auth = resolve;
    });
    const session = await createTailscaleSession({
      controlURL,
      hostname: 'interactive-browser',
      onEvent: (event) => {
        if (event.type === 'auth-url') auth(event.url);
      },
    });
    try {
      await session.login();
      const target = await url;
      const approved = await fetch(target);
      if (!approved.ok) throw new Error('Approval failed');
      const deadline = Date.now() + 20000;
      while ((await session.status()).state !== 'Running') {
        if (Date.now() > deadline) throw new Error('Interactive login did not finish');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await session.logout();
      return { authenticated: true, afterLogout: (await session.status()).state };
    } finally {
      await session[Symbol.asyncDispose]();
    }
  }, process.env.WALOS_TEST_INTERACTIVE!);
  expect(result.authenticated).toBe(true);
  expect(result.afterLogout).not.toBe('Running');
});
