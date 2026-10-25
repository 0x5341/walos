import type { Walos, Exit } from '@walos/os';
import { attachDiagnostics, type TimelineEvent } from '@walos/os/diagnostics';

const now = () => performance.timeOrigin + performance.now();
interface CommandSample {
  commandId: number;
  command: string;
  inputAt: number;
  promptDomAt?: number;
  promptFrameAt?: number;
  inputToPromptDomMs?: number;
  inputToPromptFrameMs?: number;
  inputToFirstOutputMs?: number;
  inputToExitMs?: number;
  status?: number;
  inputReady?: boolean;
  output: string;
  exits: { pid: number; at: number; exit: Exit; durationMs: number }[];
  timeline: TimelineEvent[];
}

/** Only installed by the explicit benchmark query; uses the real Enter handler. */
export function installBenchmark(os: Walos, detailed: boolean) {
  const diagnostics = attachDiagnostics(os, detailed);
  let ready = false;
  let active: CommandSample | undefined;
  let completed: CommandSample | undefined;
  let fragments: { pid: number; text: string; at: number; frame: Promise<number> }[] = [];
  let shellPid: number | undefined;
  let error: string | undefined;
  let bootTimeline: TimelineEvent[] = [];
  diagnostics.onPrompt = (marker) => {
    if (marker.commandId === 0) {
      shellPid = os.foreground.input ?? undefined;
      void diagnostics.collect().then((events) => {
        bootTimeline = events;
        ready = true;
      });
      return;
    }
    const sample = active;
    if (!sample || sample.commandId !== marker.commandId) {
      error = `Unexpected prompt ID ${marker.commandId}`;
      return;
    }
    // The marker identifies which already-rendered bytes are the prompt. Keep
    // their actual DOM mutation timestamp, not the later control receipt.
    const promptFragment = fragments.findLast(
      (fragment) => fragment.pid === shellPid && fragment.text.length,
    );
    if (!promptFragment) {
      error = 'Prompt DOM bytes missing';
      return;
    }
    sample.promptDomAt = promptFragment.at;
    sample.inputToPromptDomMs = sample.promptDomAt - sample.inputAt;
    const domEvent = diagnostics.mark('ui.prompt.dom');
    if (domEvent) domEvent.at = sample.promptDomAt;
    sample.status = marker.status;
    // Remove the exact trailing prompt byte count reported by printf, never a
    // search for "$ ". Local echo never enters this collection.
    let remaining = marker.promptBytes;
    for (const fragment of [...fragments].reverse()) {
      if (fragment.pid !== shellPid) continue;
      const bytes = new TextEncoder().encode(fragment.text);
      const take = Math.min(remaining, bytes.length);
      fragment.text = new TextDecoder().decode(bytes.subarray(0, bytes.length - take));
      remaining -= take;
      if (!remaining) break;
    }
    if (remaining) error = 'Prompt marker arrived without all prompt bytes';
    sample.output = fragments.map((fragment) => fragment.text).join('');
    const first = fragments.find((fragment) => fragment.text.length);
    if (first) sample.inputToFirstOutputMs = first.at - sample.inputAt;
    void promptFragment.frame.then((frameAt) => {
      sample.promptFrameAt = frameAt;
      sample.inputToPromptFrameMs = sample.promptFrameAt - sample.inputAt;
      const frameEvent = diagnostics.mark('ui.prompt.frame');
      if (frameEvent) frameEvent.at = frameAt;
      sample.inputReady =
        os.foreground.input === shellPid &&
        !document.querySelector<HTMLInputElement>('#input')!.disabled;
      void diagnostics.collect().then((timeline) => {
        sample.timeline = timeline.filter((event) => event.commandId === sample.commandId);
        if (sample.exits.length)
          sample.inputToExitMs = Math.max(...sample.exits.map((exit) => exit.at)) - sample.inputAt;
        completed = sample;
        active = undefined;
      });
    });
  };
  const hook = {
    begin(command: string) {
      if (!ready || active) throw new Error('Benchmark input overlaps a pending command');
      const inputAt = now();
      diagnostics.config.commandId++;
      diagnostics.mark('ui.enter');
      active = {
        commandId: diagnostics.config.commandId,
        command,
        inputAt,
        output: '',
        exits: [],
        timeline: [],
      };
      fragments = [];
      completed = undefined;
    },
    domStart(pid?: number) {
      diagnostics.mark('ui.dom.start', { localEcho: pid === undefined, pid });
    },
    domEnd(pid?: number) {
      diagnostics.mark('ui.dom.end', { localEcho: pid === undefined, pid });
    },
    output(pid: number | undefined, text: string) {
      if (active && pid !== undefined)
        fragments.push({
          pid,
          text,
          at: now(),
          frame: new Promise((resolve) => requestAnimationFrame(() => resolve(now()))),
        });
    },
    exit(pid: number, exit: Exit, durationMs: number) {
      if (active && pid !== shellPid) active.exits.push({ pid, exit, durationMs, at: now() });
    },
    snapshot() {
      return { ready, active, completed, error, detailed, shellPid, bootTimeline };
    },
  };
  window.walosBenchmark = hook;
  return hook;
}
declare global {
  interface Window {
    walosBenchmark?: ReturnType<typeof installBenchmark>;
  }
}
