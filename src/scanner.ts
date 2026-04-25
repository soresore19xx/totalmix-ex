import { execFile } from 'child_process';
import { sendOsc, onOsc, offOsc, type OscHandler } from './oscService';
import { ensureBus } from './shared';

export type ChannelInfo = { index: number; name: string };
export type ScanResult  = { Input: ChannelInfo[]; Playback: ChannelInfo[]; Output: ChannelInfo[] };

const BUSES = ['Input', 'Playback', 'Output'] as const;
const MAX_CH     = 24;
const COLLECT_MS = 500;

async function collectBus(
  host: string, sendPort: number, recvPort: number,
  bus: typeof BUSES[number]
): Promise<ChannelInfo[]> {
  return new Promise((resolve) => {
    const names: string[] = new Array(MAX_CH).fill('');

    const handler: OscHandler = (addr, args) => {
      const m = addr.match(/^\/1\/trackname(\d+)$/);
      if (m) {
        const idx = parseInt(m[1]) - 1;
        if (idx >= 0 && idx < MAX_CH) names[idx] = String(args[0] ?? '');
      }
    };

    onOsc(recvPort, handler);
    ensureBus(host, sendPort, recvPort, bus);

    setTimeout(() => {
      offOsc(recvPort, handler);
      const result: ChannelInfo[] = [];
      for (let i = 0; i < MAX_CH; i++) {
        if (names[i]) result.push({ index: i + 1, name: names[i] });
      }
      resolve(result);
    }, COLLECT_MS);
  });
}

export type RmeDevice = { name: string };

export function scanRmeDevices(): Promise<RmeDevice[]> {
  return new Promise((resolve) => {
    execFile('system_profiler', ['SPAudioDataType', '-json'], (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        const data = JSON.parse(stdout);
        const devices: RmeDevice[] = [];
        function walk(obj: unknown) {
          if (Array.isArray(obj)) { obj.forEach(walk); return; }
          if (typeof obj !== 'object' || !obj) return;
          const o = obj as Record<string, unknown>;
          const name = o['_name'] as string | undefined;
          const mfr  = (o['coreaudio_device_manufacturer'] as string | undefined) ?? '';
          if (name && mfr.toLowerCase().includes('rme')) devices.push({ name });
          Object.values(o).forEach(walk);
        }
        walk(data);
        resolve(devices);
      } catch { resolve([]); }
    });
  });
}

export async function scanDevices(
  host: string, sendPort: number, recvPort: number
): Promise<ScanResult> {
  const Input    = await collectBus(host, sendPort, recvPort, 'Input');
  const Playback = await collectBus(host, sendPort, recvPort, 'Playback');
  const Output   = await collectBus(host, sendPort, recvPort, 'Output');
  return { Input, Playback, Output };
}
