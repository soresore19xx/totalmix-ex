import { action, streamDeck, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendOsc } from "../oscService";
import { scanRmeDevices } from "../scanner";
import { applyLabel } from "../label";

type Settings = { host?: string; sendPort?: number; recvPort?: number; snapshotNum?: number; label?: string; labelFont?: string; labelSize?: number };

function conn(s: Settings) {
  return { host: s.host || '127.0.0.1', sendPort: s.sendPort || 7001 };
}

@action({ UUID: "com.hogehoge.totalmix-ex.snapshot" })
export class Snapshot extends SingletonAction<Settings> {
  override onWillAppear(ev: WillAppearEvent<Settings>): void { applyLabel(ev.action, ev.payload.settings); }
  override onWillDisappear(_ev: WillDisappearEvent<Settings>): void { /* stateless */ }
  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void { applyLabel(ev.action, ev.payload.settings); }

  override onKeyDown(ev: KeyDownEvent<Settings>): void {
    const { host, sendPort } = conn(ev.payload.settings);
    const num = Math.max(1, Math.min(8, ev.payload.settings.snapshotNum ?? 1));
    // OscTableTotalMix: Page3 (/3/), 番号逆順 (Snap1=/3/snapshots/8/1 ... Snap8=/3/snapshots/1/1)
    sendOsc(host, sendPort, `/3/snapshots/${9 - num}/1`, 1.0);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonObject, Settings>): Promise<void> {
    if (ev.payload['action'] === 'scanDevices') {
      const devices = await scanRmeDevices();
      await streamDeck.ui.sendToPropertyInspector({ action: 'scanDevicesResult', devices });
    }
  }
}
