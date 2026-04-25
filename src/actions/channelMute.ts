import { action, streamDeck, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendOsc, onOsc, offOsc, type OscHandler } from "../oscService";
import { ensureBus, initBusTracking, type Bus } from "../shared";
import { scanDevices, scanRmeDevices } from "../scanner";
import { applyLabel } from "../label";

type Settings = { host?: string; sendPort?: number; recvPort?: number; bus?: Bus; channel?: number; label?: string; labelFont?: string; labelSize?: number };

function conn(s: Settings) {
  return { host: s.host || '127.0.0.1', sendPort: s.sendPort || 7001, recvPort: s.recvPort || 9001 };
}

@action({ UUID: "com.hogehoge.totalmix-ex.ch-mute" })
export class ChannelMute extends SingletonAction<Settings> {
  private handlers   = new Map<string, OscHandler>();
  private muteStates = new Map<string, boolean>(); // host:port:ch → armed

  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    initBusTracking(recvPort);
    this.subscribe(ev.action.id, recvPort, host, sendPort, channel,
      (on) => { (ev.action as import("@elgato/streamdeck").KeyAction<Settings>).setState(on ? 1 : 0); applyLabel(ev.action, ev.payload.settings, on); });
    applyLabel(ev.action, ev.payload.settings);
    ensureBus(host, sendPort, recvPort, bus);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
  }

  override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    this.unsubscribe(ev.action.id, conn(ev.payload.settings).recvPort);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    this.unsubscribe(ev.action.id, recvPort);
    initBusTracking(recvPort);
    this.subscribe(ev.action.id, recvPort, host, sendPort, channel,
      (on) => { (ev.action as import("@elgato/streamdeck").KeyAction<Settings>).setState(on ? 1 : 0); applyLabel(ev.action, ev.payload.settings, on); });
    applyLabel(ev.action, ev.payload.settings);
    ensureBus(host, sendPort, recvPort, bus);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
  }

  override onKeyDown(ev: KeyDownEvent<Settings>): void {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    ensureBus(host, sendPort, recvPort, bus);
    const mk   = `${host}:${sendPort}:${channel}`;
    const next = !(this.muteStates.get(mk) ?? false);
    this.muteStates.set(mk, next);
    sendOsc(host, sendPort, `/1/mute/1/${channel}`, next ? 1.0 : 0.0);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonObject, Settings>): Promise<void> {
    const act = ev.payload['action'];
    if (act === 'scan') {
      const { host, sendPort, recvPort } = conn(ev.payload as unknown as Settings);
      try {
        const result = await scanDevices(host, sendPort, recvPort);
        await streamDeck.ui.sendToPropertyInspector({ action: 'scanResult', result });
      } catch (e) {
        await streamDeck.ui.sendToPropertyInspector({ action: 'scanResult', error: String(e) });
      }
    } else if (act === 'scanDevices') {
      const devices = await scanRmeDevices();
      await streamDeck.ui.sendToPropertyInspector({ action: 'scanDevicesResult', devices });
    }
  }

  private subscribe(id: string, recvPort: number, host: string, sendPort: number, channel: number, cb: (on: boolean) => void): void {
    const target = `/1/mute/1/${channel}`;
    const mk     = `${host}:${sendPort}:${channel}`;
    const h: OscHandler = (addr, args) => {
      if (addr === target) {
        const on = (args[0] as number) > 0.5;
        this.muteStates.set(mk, on);
        cb(on);
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
