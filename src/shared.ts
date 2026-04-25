import { sendOsc, onOsc } from "./oscService";

export type Bus = 'Input' | 'Playback' | 'Output';

export const faderValues    = new Map<string, number>();
export const panValues      = new Map<string, number>();
export const masterVolValues = new Map<string, number>();

export function faderKey(host: string, sendPort: number, channel: number): string {
  return `${host}:${sendPort}:${channel}`;
}

export function masterKey(host: string, sendPort: number): string {
  return `${host}:${sendPort}`;
}

// Bus state tracking per connection (host:sendPort)
const activeBus = new Map<string, Bus>();

const BUS_ADDR: Record<Bus, string> = {
  Input:    '/1/busInput',
  Playback: '/1/busPlayback',
  Output:   '/1/busOutput',
};

const trackedPorts = new Set<number>();

export function initBusTracking(recvPort: number): void {
  if (trackedPorts.has(recvPort)) return;
  trackedPorts.add(recvPort);
  onOsc(recvPort, (addr, args) => {
    for (const [bus, oscAddr] of Object.entries(BUS_ADDR) as [Bus, string][]) {
      if (addr === oscAddr && (args[0] as number) > 0.5) {
        // We don't know which host:sendPort sent this feedback,
        // so track by recvPort as the key
        activeBus.set(`${recvPort}`, bus);
      }
    }
  });
}

export function ensureBus(host: string, sendPort: number, recvPort: number, bus: Bus): void {
  ensureBusChanged(host, sendPort, recvPort, bus);
}

export function ensureBusChanged(host: string, sendPort: number, recvPort: number, bus: Bus): boolean {
  const key = `${recvPort}`;
  if (activeBus.get(key) !== bus) {
    sendOsc(host, sendPort, BUS_ADDR[bus], 1.0);
    activeBus.set(key, bus);
    return true;
  }
  return false;
}
