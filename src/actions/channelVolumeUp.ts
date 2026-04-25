import { action, streamDeck, KeyDownEvent, KeyUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendOsc, onOsc, offOsc, type OscHandler } from "../oscService";
import { faderValues, faderKey, ensureBus, initBusTracking, type Bus } from "../shared";
import { scanDevices, scanRmeDevices } from "../scanner";
import { applyLabel } from "../label";

type Settings = {
  host?: string; sendPort?: number; recvPort?: number;
  bus?: Bus; channel?: number;
  step?: number;
  holdMode?: boolean; holdInterval?: number;
  label?: string; labelFont?: string; labelSize?: number;
};

const DEFAULT_STEP     = 0.02;
const DEFAULT_INTERVAL = 80;

function conn(s: Settings) {
  return { host: s.host || '127.0.0.1', sendPort: s.sendPort || 7001, recvPort: s.recvPort || 9001 };
}

@action({ UUID: "com.hogehoge.totalmix-ex.ch-vol-up" })
export class ChannelVolumeUp extends SingletonAction<Settings> {
  private handlers   = new Map<string, OscHandler>();
  private holdTimers = new Map<string, ReturnType<typeof setInterval>>();

  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { recvPort } = conn(ev.payload.settings);
    const channel = ev.payload.settings.channel ?? 1;
    initBusTracking(recvPort);
    this.subscribe(ev.action.id, recvPort, conn(ev.payload.settings).host, conn(ev.payload.settings).sendPort, channel);
    applyLabel(ev.action, ev.payload.settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    this.stopHold(ev.action.id);
    this.unsubscribe(ev.action.id, conn(ev.payload.settings).recvPort);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const channel = ev.payload.settings.channel ?? 1;
    this.unsubscribe(ev.action.id, recvPort);
    initBusTracking(recvPort);
    this.subscribe(ev.action.id, recvPort, host, sendPort, channel);
    applyLabel(ev.action, ev.payload.settings);
  }

  override onKeyDown(ev: KeyDownEvent<Settings>): void {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1, step = DEFAULT_STEP, holdMode = false, holdInterval = DEFAULT_INTERVAL } = ev.payload.settings;
    ensureBus(host, sendPort, recvPort, bus);

    const doStep = () => {
      const key  = faderKey(host, sendPort, channel);
      const next = Math.min(1.0, (faderValues.get(key) ?? 0.75) + step);
      faderValues.set(key, next);
      sendOsc(host, sendPort, `/1/volume${channel}`, next);
    };

    doStep();

    if (holdMode) {
      this.stopHold(ev.action.id);
      const timer = setInterval(doStep, holdInterval);
      this.holdTimers.set(ev.action.id, timer);
    }
  }

  override onKeyUp(ev: KeyUpEvent<Settings>): void {
    this.stopHold(ev.action.id);
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

  private stopHold(id: string): void {
    const t = this.holdTimers.get(id);
    if (t !== undefined) { clearInterval(t); this.holdTimers.delete(id); }
  }

  private subscribe(id: string, recvPort: number, host: string, sendPort: number, channel: number): void {
    const target = `/1/volume${channel}`;
    const h: OscHandler = (addr, args) => {
      if (addr === target) faderValues.set(faderKey(host, sendPort, channel), args[0] as number);
    };
    this.handlers.set(id, h);
    onOsc(recvPort, h);
  }

  private unsubscribe(id: string, recvPort: number): void {
    const h = this.handlers.get(id);
    if (h) { offOsc(recvPort, h); this.handlers.delete(id); }
  }
}
