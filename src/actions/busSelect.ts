import { action, streamDeck, KeyDownEvent, KeyAction, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendOsc, onOsc, offOsc, type OscHandler } from "../oscService";
import { scanRmeDevices } from "../scanner";
import { applyLabel } from "../label";

type Settings = { host?: string; sendPort?: number; recvPort?: number; bus?: 'Input' | 'Playback' | 'Output'; label?: string; labelFont?: string; labelSize?: number };

const BUS_ADDR: Record<string, string> = {
  Input:    '/1/busInput',
  Playback: '/1/busPlayback',
  Output:   '/1/busOutput',
};
const BUS_ADDRS = Object.values(BUS_ADDR);

function conn(s: Settings) {
  return { host: s.host || '127.0.0.1', sendPort: s.sendPort || 7001, recvPort: s.recvPort || 9001 };
}

@action({ UUID: "com.hogehoge.totalmix-ex.bus-select" })
export class BusSelect extends SingletonAction<Settings> {
  private handlers = new Map<string, OscHandler>();

  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const bus = ev.payload.settings.bus ?? 'Input';
    this.subscribe(ev.action.id, recvPort, bus,
      (active) => { (ev.action as KeyAction<Settings>).setState(active ? 1 : 0); applyLabel(ev.action, ev.payload.settings, active); });
    applyLabel(ev.action, ev.payload.settings);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
  }

  override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    this.unsubscribe(ev.action.id, conn(ev.payload.settings).recvPort);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const bus = ev.payload.settings.bus ?? 'Input';
    this.unsubscribe(ev.action.id, recvPort);
    this.subscribe(ev.action.id, recvPort, bus,
      (active) => { (ev.action as KeyAction<Settings>).setState(active ? 1 : 0); applyLabel(ev.action, ev.payload.settings, active); });
    applyLabel(ev.action, ev.payload.settings);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
  }

  override onKeyDown(ev: KeyDownEvent<Settings>): void {
    const { host, sendPort } = conn(ev.payload.settings);
    const bus = ev.payload.settings.bus ?? 'Input';
    sendOsc(host, sendPort, BUS_ADDR[bus], 1.0);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonObject, Settings>): Promise<void> {
    if (ev.payload['action'] === 'scanDevices') {
      const devices = await scanRmeDevices();
      await streamDeck.ui.sendToPropertyInspector({ action: 'scanDevicesResult', devices });
    }
  }

  private subscribe(id: string, recvPort: number, bus: string, cb: (active: boolean) => void): void {
    const myAddr = BUS_ADDR[bus];
    const h: OscHandler = (addr, args) => {
      if (addr === myAddr) {
        cb((args[0] as number) > 0.5);
      } else if (BUS_ADDRS.includes(addr) && (args[0] as number) > 0.5) {
        // 別バスがアクティブになった → このボタンは非アクティブ
        cb(false);
      }
    };
    this.handlers.set(id, h);
    onOsc(recvPort, h);
  }

  private unsubscribe(id: string, recvPort: number): void {
    const h = this.handlers.get(id);
    if (h) { offOsc(recvPort, h); this.handlers.delete(id); }
  }
}
