import { action, streamDeck, KeyDownEvent, KeyUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendOsc, onOsc, offOsc, type OscHandler } from "../oscService";
import { masterVolValues, masterKey } from "../shared";
import { scanRmeDevices } from "../scanner";
import { applyLabel } from "../label";

type Settings = { host?: string; sendPort?: number; recvPort?: number; step?: number; holdMode?: boolean; holdInterval?: number; label?: string; labelFont?: string; labelSize?: number };

const DEFAULT_STEP     = 0.02;
const DEFAULT_INTERVAL = 80;
// OscTableTotalMix: Page1, address = mastervolume (全小文字)
const MASTER_VOL_ADDR = '/1/mastervolume';

function conn(s: Settings) {
  return { host: s.host || '127.0.0.1', sendPort: s.sendPort || 7001, recvPort: s.recvPort || 9001 };
}

@action({ UUID: "com.hogehoge.totalmix-ex.main-vol-up" })
export class MainVolumeUp extends SingletonAction<Settings> {
  private handlers   = new Map<string, OscHandler>();
  private holdTimers = new Map<string, ReturnType<typeof setInterval>>();

  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    this.subscribe(ev.action.id, recvPort, host, sendPort);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
    applyLabel(ev.action, ev.payload.settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    this.stopHold(ev.action.id);
    this.unsubscribe(ev.action.id, conn(ev.payload.settings).recvPort);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    this.unsubscribe(ev.action.id, recvPort);
    this.subscribe(ev.action.id, recvPort, host, sendPort);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
    applyLabel(ev.action, ev.payload.settings);
  }

  override onKeyDown(ev: KeyDownEvent<Settings>): void {
    const { host, sendPort } = conn(ev.payload.settings);
    const { step = DEFAULT_STEP, holdMode = false, holdInterval = DEFAULT_INTERVAL } = ev.payload.settings;
    const mk = masterKey(host, sendPort);

    const doStep = () => {
      const next = Math.min(1.0, (masterVolValues.get(mk) ?? 0.75) + step);
      masterVolValues.set(mk, next);
      sendOsc(host, sendPort, MASTER_VOL_ADDR, next);
    };

    doStep();
    if (holdMode) {
      this.stopHold(ev.action.id);
      this.holdTimers.set(ev.action.id, setInterval(doStep, holdInterval));
    }
  }

  override onKeyUp(ev: KeyUpEvent<Settings>): void {
    this.stopHold(ev.action.id);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonObject, Settings>): Promise<void> {
    if (ev.payload['action'] === 'scanDevices') {
      const devices = await scanRmeDevices();
      await streamDeck.ui.sendToPropertyInspector({ action: 'scanDevicesResult', devices });
    }
  }

  private stopHold(id: string): void {
    const t = this.holdTimers.get(id);
    if (t !== undefined) { clearInterval(t); this.holdTimers.delete(id); }
  }

  private subscribe(id: string, recvPort: number, host: string, sendPort: number): void {
    const mk = masterKey(host, sendPort);
    const h: OscHandler = (addr, args) => {
      if (addr === MASTER_VOL_ADDR) masterVolValues.set(mk, args[0] as number);
    };
    this.handlers.set(id, h);
    onOsc(recvPort, h);
  }

  private unsubscribe(id: string, recvPort: number): void {
    const h = this.handlers.get(id);
    if (h) { offOsc(recvPort, h); this.handlers.delete(id); }
  }
}
