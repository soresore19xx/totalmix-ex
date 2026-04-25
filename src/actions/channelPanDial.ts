import { action, streamDeck, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent, DialRotateEvent, DialDownEvent, DialUpEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendOsc, onOsc, offOsc, type OscHandler } from "../oscService";
import { panValues, faderKey, ensureBus, initBusTracking, type Bus } from "../shared";
import { scanDevices, scanRmeDevices } from "../scanner";
import { makeDialTitleImage, makeGaugeSvg, makeValueImage } from "../label";

type Settings = { host?: string; sendPort?: number; recvPort?: number; bus?: Bus; channel?: number; titleLabel?: string; titleFont?: string; titleSize?: number; titleColor?: string; gaugeFill?: string; gaugeBg?: string; lcdBg?: string };

const DEFAULT_STEP = 0.05;

function conn(s: Settings) {
  return { host: s.host || '127.0.0.1', sendPort: s.sendPort || 7001, recvPort: s.recvPort || 9001 };
}

function panToDisplay(pan: number): string {
  const v = Math.round((pan - 0.5) * 128);
  if (v === 0) return 'CTR';
  return v < 0 ? `L${Math.abs(v)}` : `R${v}`;
}

@action({ UUID: "com.hogehoge.totalmix-ex.ch-pan-dial" })
export class ChannelPanDial extends SingletonAction<Settings> {
  private handlers     = new Map<string, OscHandler>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dialActions  = new Map<string, any>();
  private dialBusy     = new Map<string, number>();

  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    this.dialActions.set(ev.action.id, ev.action);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ev.action as any).setFeedbackLayout('layouts/pan-dial.json');
    initBusTracking(recvPort);
    this.subscribe(ev.action.id, recvPort, host, sendPort, channel, ev.payload.settings.titleLabel || '', ev.payload.settings.titleFont || 'Arial', ev.payload.settings.titleSize || 12, ev.payload.settings.titleColor || '#ffffff', ev.payload.settings.gaugeFill || '#FF9900', ev.payload.settings.gaugeBg || '#2a1a0a', ev.payload.settings.lcdBg || '#000000');
    ensureBus(host, sendPort, recvPort, bus);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
    this.pushFeedback(ev.action, channel, host, sendPort, ev.payload.settings.titleLabel || '', ev.payload.settings.titleFont || 'Arial', ev.payload.settings.titleSize || 12, ev.payload.settings.titleColor || '#ffffff', ev.payload.settings.gaugeFill || '#FF9900', ev.payload.settings.gaugeBg || '#2a1a0a', ev.payload.settings.lcdBg || '#000000');
  }

  override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    this.dialActions.delete(ev.action.id);
    this.unsubscribe(ev.action.id, conn(ev.payload.settings).recvPort);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    this.dialActions.set(ev.action.id, ev.action);
    this.unsubscribe(ev.action.id, recvPort);
    initBusTracking(recvPort);
    this.subscribe(ev.action.id, recvPort, host, sendPort, channel, ev.payload.settings.titleLabel || '', ev.payload.settings.titleFont || 'Arial', ev.payload.settings.titleSize || 12, ev.payload.settings.titleColor || '#ffffff', ev.payload.settings.gaugeFill || '#FF9900', ev.payload.settings.gaugeBg || '#2a1a0a', ev.payload.settings.lcdBg || '#000000');
    ensureBus(host, sendPort, recvPort, bus);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
    this.pushFeedback(ev.action, channel, host, sendPort, ev.payload.settings.titleLabel || '', ev.payload.settings.titleFont || 'Arial', ev.payload.settings.titleSize || 12, ev.payload.settings.titleColor || '#ffffff', ev.payload.settings.gaugeFill || '#FF9900', ev.payload.settings.gaugeBg || '#2a1a0a', ev.payload.settings.lcdBg || '#000000');
  }

  override onDialRotate(ev: DialRotateEvent<Settings>): void {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    ensureBus(host, sendPort, recvPort, bus);

    const key    = faderKey(host, sendPort, channel);
    const delta  = ev.payload.ticks * DEFAULT_STEP;
    const next   = Math.min(1.0, Math.max(0.0, (panValues.get(key) ?? 0.5) + delta));
    panValues.set(key, next);
    this.dialBusy.set(key, Date.now());
    sendOsc(host, sendPort, `/1/pan${channel}`, next);
    this.pushFeedback(ev.action, channel, host, sendPort, ev.payload.settings.titleLabel || '', ev.payload.settings.titleFont || 'Arial', ev.payload.settings.titleSize || 12, ev.payload.settings.titleColor || '#ffffff', ev.payload.settings.gaugeFill || '#FF9900', ev.payload.settings.gaugeBg || '#2a1a0a', ev.payload.settings.lcdBg || '#000000');
  }

  override onDialDown(ev: DialDownEvent<Settings>): void {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    ensureBus(host, sendPort, recvPort, bus);
    // ダイヤル押下でセンターリセット
    panValues.set(faderKey(host, sendPort, channel), 0.5);
    sendOsc(host, sendPort, `/1/pan${channel}`, 0.5);
    this.pushFeedback(ev.action, channel, host, sendPort, ev.payload.settings.titleLabel || '', ev.payload.settings.titleFont || 'Arial', ev.payload.settings.titleSize || 12, ev.payload.settings.titleColor || '#ffffff', ev.payload.settings.gaugeFill || '#FF9900', ev.payload.settings.gaugeBg || '#2a1a0a', ev.payload.settings.lcdBg || '#000000');
  }

  override onDialUp(_ev: DialUpEvent<Settings>): void { /* no-op */ }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pushFeedback(dialAction: any, channel: number, host: string, sendPort: number, titleLabel = '', titleFont = 'Arial', titleSize = 12, titleColor = '#ffffff', gaugeFill = '#FF9900', gaugeBg = '#2a1a0a', lcdBg = '#000000'): void {
    const key = faderKey(host, sendPort, channel);
    const pan = panValues.get(key) ?? 0.5;
    const pct = Math.round(pan * 100);
    dialAction.setFeedback({
      titlePx: makeDialTitleImage(titleLabel || `Ch ${channel} Pan`, titleFont, titleSize, titleColor, 120, 51, lcdBg),
      value:   makeValueImage(panToDisplay(pan), lcdBg),
      gauge:   makeGaugeSvg(pct, gaugeFill, gaugeBg, true, lcdBg),
    });
  }

  private subscribe(id: string, recvPort: number, host: string, sendPort: number, channel: number, titleLabel: string, titleFont: string, titleSize: number, titleColor: string, gaugeFill: string, gaugeBg: string, lcdBg: string): void {
    const panAddr = `/1/pan${channel}`;
    const key     = faderKey(host, sendPort, channel);
    const h: OscHandler = (addr, args) => {
      if (addr === panAddr) {
        const lastDial = this.dialBusy.get(key) ?? 0;
        if (Date.now() - lastDial < 300) return;
        panValues.set(key, args[0] as number);
        const da = this.dialActions.get(id);
        if (da) this.pushFeedback(da, channel, host, sendPort, titleLabel, titleFont, titleSize, titleColor, gaugeFill, gaugeBg, lcdBg);
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
