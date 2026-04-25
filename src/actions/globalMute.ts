import { action, streamDeck, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendOsc, onOsc, offOsc, type OscHandler } from "../oscService";
import { scanRmeDevices } from "../scanner";
import { applyLabel } from "../label";

type Settings = { host?: string; sendPort?: number; recvPort?: number; label?: string; labelFont?: string; labelSize?: number };

function conn(s: Settings) {
  return { host: s.host || '127.0.0.1', sendPort: s.sendPort || 7001, recvPort: s.recvPort || 9001 };
}

@action({ UUID: "com.hogehoge.totalmix-ex.global-mute" })
export class GlobalMute extends SingletonAction<Settings> {
  private handlers = new Map<string, OscHandler>();

  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    this.subscribe(ev.action.id, recvPort,
      (on) => { (ev.action as import("@elgato/streamdeck").KeyAction<Settings>).setState(on ? 1 : 0); applyLabel(ev.action, ev.payload.settings, on); });
    applyLabel(ev.action, ev.payload.settings);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
  }

  override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    this.unsubscribe(ev.action.id, conn(ev.payload.settings).recvPort);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    this.unsubscribe(ev.action.id, recvPort);
    this.subscribe(ev.action.id, recvPort,
      (on) => { (ev.action as import("@elgato/streamdeck").KeyAction<Settings>).setState(on ? 1 : 0); applyLabel(ev.action, ev.payload.settings, on); });
    applyLabel(ev.action, ev.payload.settings);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
  }

  override onKeyDown(ev: KeyDownEvent<Settings>): void {
    const { host, sendPort } = conn(ev.payload.settings);
    sendOsc(host, sendPort, '/1/globalMute', 1.0);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonObject, Settings>): Promise<void> {
    if (ev.payload['action'] === 'scanDevices') {
      const devices = await scanRmeDevices();
      await streamDeck.ui.sendToPropertyInspector({ action: 'scanDevicesResult', devices });
    }
  }

  private subscribe(id: string, recvPort: number, cb: (on: boolean) => void): void {
    const h: OscHandler = (addr, args) => {
      if (addr === '/1/globalMute') cb((args[0] as number) > 0.5);
    };
    this.handlers.set(id, h);
    onOsc(recvPort, h);
  }

  private unsubscribe(id: string, recvPort: number): void {
    const h = this.handlers.get(id);
    if (h) { offOsc(recvPort, h); this.handlers.delete(id); }
  }
}
