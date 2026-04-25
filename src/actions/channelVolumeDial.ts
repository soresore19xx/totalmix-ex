import { action, streamDeck, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent, DialRotateEvent, DialDownEvent, DialUpEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendOsc, onOsc, offOsc, type OscHandler } from "../oscService";
import { faderValues, faderKey, ensureBus, initBusTracking, type Bus } from "../shared";
import { scanDevices, scanRmeDevices } from "../scanner";
import { makeDialTitleImage, makeGaugeSvg, makeValueImage } from "../label";

type Settings = {
  host?: string; sendPort?: number; recvPort?: number;
  bus?: Bus; channel?: number;
  step?: number;
  titleLabel?: string; titleFont?: string; titleSize?: number; titleColor?: string;
  gaugeFill?: string; gaugeBg?: string; lcdBg?: string;
};

const DEFAULT_STEP = 0.1;

function conn(s: Settings) {
  return { host: s.host || '127.0.0.1', sendPort: s.sendPort || 7001, recvPort: s.recvPort || 9001 };
}

// TotalMix fader: 0.0 = -65 dB, 0.75 = 0 dB, 1.0 = +6 dB
function faderToDb(vol: number): string {
  if (vol < 0.001) return '-∞ dB';
  let db: number;
  if (vol >= 0.75) {
    db = (vol - 0.75) / 0.25 * 6.0;
  } else {
    db = (vol / 0.75 - 1.0) * 65.0;
  }
  return (db >= 0 ? '+' : '') + Math.round(db) + ' dB';
}

function muteKey(host: string, sendPort: number, channel: number): string {
  return `${host}:${sendPort}:${channel}:mute`;
}

@action({ UUID: "com.hogehoge.totalmix-ex.ch-vol-dial" })
export class ChannelVolumeDial extends SingletonAction<Settings> {
  private handlers      = new Map<string, OscHandler>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dialActions   = new Map<string, any>();
  private dialSettings  = new Map<string, { host: string; sendPort: number; channel: number; titleLabel: string; titleFont: string; titleSize: number; titleColor: string; gaugeFill: string; gaugeBg: string; lcdBg: string }>();
  private muteStates    = new Map<string, boolean>(); // true = armed (muted)
  private dialBusy      = new Map<string, number>();  // key → timestamp of last dial action
  private rampTargets   = new Map<string, number>();  // key → target fader value
  private rampTimers    = new Map<string, ReturnType<typeof setInterval>>();
  private rampContexts  = new Map<string, { host: string; sendPort: number; channel: number }>();

  override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    this.dialActions.set(ev.action.id, ev.action);
    this.dialSettings.set(ev.action.id, { host, sendPort, channel, titleLabel: ev.payload.settings.titleLabel || '', titleFont: ev.payload.settings.titleFont || 'Arial', titleSize: ev.payload.settings.titleSize || 12, titleColor: ev.payload.settings.titleColor || '#ffffff', gaugeFill: ev.payload.settings.gaugeFill || '#0099FF', gaugeBg: ev.payload.settings.gaugeBg || '#1a2a3a', lcdBg: ev.payload.settings.lcdBg || '#000000' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ev.action as any).setFeedbackLayout('layouts/vol-dial.json');
    initBusTracking(recvPort);
    this.subscribe(ev.action.id, recvPort, host, sendPort, channel);
    ensureBus(host, sendPort, recvPort, bus);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
    this.pushFeedback(ev.action, host, sendPort, channel, ev.payload.settings.titleLabel || '', ev.payload.settings.titleFont || 'Arial', ev.payload.settings.titleSize || 12, ev.payload.settings.titleColor || '#ffffff', ev.payload.settings.gaugeFill || '#0099FF', ev.payload.settings.gaugeBg || '#1a2a3a', ev.payload.settings.lcdBg || '#000000');
  }

  override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
    this.dialActions.delete(ev.action.id);
    this.dialSettings.delete(ev.action.id);
    this.unsubscribe(ev.action.id, conn(ev.payload.settings).recvPort);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    this.dialActions.set(ev.action.id, ev.action);
    this.dialSettings.set(ev.action.id, { host, sendPort, channel, titleLabel: ev.payload.settings.titleLabel || '', titleFont: ev.payload.settings.titleFont || 'Arial', titleSize: ev.payload.settings.titleSize || 12, titleColor: ev.payload.settings.titleColor || '#ffffff', gaugeFill: ev.payload.settings.gaugeFill || '#0099FF', gaugeBg: ev.payload.settings.gaugeBg || '#1a2a3a', lcdBg: ev.payload.settings.lcdBg || '#000000' });
    this.unsubscribe(ev.action.id, recvPort);
    initBusTracking(recvPort);
    this.subscribe(ev.action.id, recvPort, host, sendPort, channel);
    ensureBus(host, sendPort, recvPort, bus);
    sendOsc(host, sendPort, '/1/refresh', 1.0);
    this.pushFeedback(ev.action, host, sendPort, channel, ev.payload.settings.titleLabel || '', ev.payload.settings.titleFont || 'Arial', ev.payload.settings.titleSize || 12, ev.payload.settings.titleColor || '#ffffff', ev.payload.settings.gaugeFill || '#0099FF', ev.payload.settings.gaugeBg || '#1a2a3a', ev.payload.settings.lcdBg || '#000000');
  }

  override onDialRotate(ev: DialRotateEvent<Settings>): void {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1, step = DEFAULT_STEP } = ev.payload.settings;
    ensureBus(host, sendPort, recvPort, bus);

    const key    = faderKey(host, sendPort, channel);
    const ticks  = ev.payload.ticks;
    const delta  = Math.sign(ticks) * Math.pow(Math.abs(ticks), 1.5) * step;
    const target = Math.min(1.0, Math.max(0.0, (this.rampTargets.get(key) ?? faderValues.get(key) ?? 0.75) + delta));
    this.dialBusy.set(key, Date.now());
    this.startRamp(key, target, host, sendPort, channel);
  }

  override onDialDown(ev: DialDownEvent<Settings>): void {
    const { host, sendPort, recvPort } = conn(ev.payload.settings);
    const { bus = 'Input', channel = 1 } = ev.payload.settings;
    ensureBus(host, sendPort, recvPort, bus);

    const mk   = muteKey(host, sendPort, channel);
    const next = !(this.muteStates.get(mk) ?? false);
    this.muteStates.set(mk, next);
    // TotalMix M button: 1.0 = arm (muted), 0.0 = disarm (unmuted)
    sendOsc(host, sendPort, `/1/mute/1/${channel}`, next ? 1.0 : 0.0);
    const ds = this.dialSettings.get(ev.action.id);
    this.pushFeedback(ev.action, host, sendPort, channel, ds?.titleLabel || '', ds?.titleFont || 'Arial', ds?.titleSize || 12, ds?.titleColor || '#ffffff');
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

  private startRamp(key: string, target: number, host: string, sendPort: number, channel: number): void {
    this.rampTargets.set(key, target);
    this.rampContexts.set(key, { host, sendPort, channel });
    if (this.rampTimers.has(key)) return; // already running

    const tick = () => {
      const ctx = this.rampContexts.get(key)!;
      const tgt = this.rampTargets.get(key)!;
      const cur = faderValues.get(key) ?? tgt;
      const diff = tgt - cur;

      if (Math.abs(diff) < 0.002) {
        faderValues.set(key, tgt);
        sendOsc(ctx.host, ctx.sendPort, `/1/volume${ctx.channel}`, tgt);
        clearInterval(this.rampTimers.get(key));
        this.rampTimers.delete(key);
        this.rampTargets.delete(key);
      } else {
        const next = cur + diff * 0.35; // exponential approach ~150ms
        faderValues.set(key, next);
        sendOsc(ctx.host, ctx.sendPort, `/1/volume${ctx.channel}`, next);
      }
      // update display only for dial actions assigned to this channel
      this.dialActions.forEach((da, id) => {
        const s = this.dialSettings.get(id);
        if (s && s.host === ctx.host && s.sendPort === ctx.sendPort && s.channel === ctx.channel) {
          this.pushFeedback(da, ctx.host, ctx.sendPort, ctx.channel, s.titleLabel, s.titleFont, s.titleSize, s.titleColor, s.gaugeFill, s.gaugeBg, s.lcdBg);
        }
      });
    };

    this.rampTimers.set(key, setInterval(tick, 20));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pushFeedback(dialAction: any, host: string, sendPort: number, channel: number, titleLabel = '', titleFont = 'Arial', titleSize = 12, titleColor = '#ffffff', gaugeFill = '#0099FF', gaugeBg = '#1a2a3a', lcdBg = '#000000'): void {
    const mk    = muteKey(host, sendPort, channel);
    const muted = this.muteStates.get(mk) ?? false;
    const vol   = faderValues.get(faderKey(host, sendPort, channel)) ?? 0.75;
    const pct   = muted ? 0 : Math.round(vol * 100);
    dialAction.setFeedback({
      titlePx: makeDialTitleImage(titleLabel || `Ch ${channel}`, titleFont, titleSize, titleColor, 120, 51, lcdBg),
      value:   makeValueImage(muted ? '[MUTED]' : faderToDb(vol), lcdBg),
      gauge:   makeGaugeSvg(muted ? 0 : pct, gaugeFill, gaugeBg, false, lcdBg),
    });
  }

  private subscribe(id: string, recvPort: number, host: string, sendPort: number, channel: number): void {
    const volAddr  = `/1/volume${channel}`;
    const muteAddr = `/1/mute/1/${channel}`;
    const mk       = muteKey(host, sendPort, channel);
    const h: OscHandler = (addr, args) => {
      if (addr === volAddr) {
        const key = faderKey(host, sendPort, channel);
        // ignore OSC feedback for 300ms after dial operation to avoid display bounce
        const lastDial = this.dialBusy.get(key) ?? 0;
        if (Date.now() - lastDial < 300) return;
        faderValues.set(key, args[0] as number);
        const da = this.dialActions.get(id);
        const ds = this.dialSettings.get(id);
        if (da) this.pushFeedback(da, host, sendPort, channel, ds?.titleLabel || '', ds?.titleFont || 'Arial', ds?.titleSize || 12, ds?.titleColor || '#ffffff', ds?.gaugeFill || '#0099FF', ds?.gaugeBg || '#1a2a3a', ds?.lcdBg || '#000000');
      }
      if (addr === muteAddr) {
        const armed = (args[0] as number) > 0.5;
        this.muteStates.set(mk, armed);
        const da = this.dialActions.get(id);
        const ds = this.dialSettings.get(id);
        if (da) this.pushFeedback(da, host, sendPort, channel, ds?.titleLabel || '', ds?.titleFont || 'Arial', ds?.titleSize || 12, ds?.titleColor || '#ffffff', ds?.gaugeFill || '#0099FF', ds?.gaugeBg || '#1a2a3a', ds?.lcdBg || '#000000');
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
