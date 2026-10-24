// Browser CDP attaches to the actual Dedicated Worker, not to the page's heap.
export async function workerMemory(browser) {
  let cdp;
  let sessionId;
  try {
    cdp = await browser.newBrowserCDPSession();
    const { targetInfos } = await cdp.send('Target.getTargets');
    const targets = targetInfos.filter(
      (target) => target.type === 'worker' && target.url.includes('process.worker'),
    );
    if (targets.length !== 1)
      throw new Error(`Expected one Process Worker target, found ${targets.length}`);
    ({ sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: targets[0].targetId,
      flatten: false,
    }));
    const heap = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker heap measurement timed out')), 10000);
      cdp.on('Target.receivedMessageFromTarget', (event) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        if (message.id !== 1) return;
        clearTimeout(timer);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      });
      cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id: 1, method: 'Runtime.getHeapUsage' }),
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
    if (!Number.isFinite(heap.usedSize) || !Number.isFinite(heap.totalSize))
      throw new Error('Worker heap usage counters are unavailable');
    return {
      memoryStatus: 'available',
      jsHeapUsedBytes: heap.usedSize,
      jsHeapTotalBytes: heap.totalSize,
      ...(heap.embedderHeapUsedSize !== undefined && {
        embedderHeapUsedBytes: heap.embedderHeapUsedSize,
      }),
      ...(heap.backingStorageSize !== undefined && {
        backingStorageBytes: heap.backingStorageSize,
      }),
    };
  } catch (error) {
    return { memoryStatus: 'unavailable', memoryReason: String(error) };
  } finally {
    if (sessionId) await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    await cdp?.detach().catch(() => {});
  }
}
