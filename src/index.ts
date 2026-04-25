import streamDeck from "@elgato/streamdeck";
import fs from "fs";
import { GlobalMute } from "./actions/globalMute";
import { GlobalSolo } from "./actions/globalSolo";
import { ChannelMute } from "./actions/channelMute";
import { ChannelSolo } from "./actions/channelSolo";
import { ChannelVolumeUp } from "./actions/channelVolumeUp";
import { ChannelVolumeDown } from "./actions/channelVolumeDown";
import { ChannelVolumeDial } from "./actions/channelVolumeDial";
import { BusSelect } from "./actions/busSelect";
import { Snapshot } from "./actions/snapshot";
import { ChannelPhantom } from "./actions/channelPhantom";
import { MainVolumeUp } from "./actions/mainVolumeUp";
import { MainVolumeDown } from "./actions/mainVolumeDown";
import { ChannelPanDial } from "./actions/channelPanDial";
import { Dim } from "./actions/dim";
import { Talkback } from "./actions/talkback";

process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });

const safeLog = (msg: string) => { try { process.stderr.write(msg + '\n'); } catch {} };
process.on('uncaughtException', (err) => {
  const stack = err instanceof Error ? (err.stack ?? String(err)) : String(err);
  safeLog(`[plugin] uncaughtException: ${stack}`);
  try { fs.appendFileSync('/tmp/totalmix-crash.log', new Date().toISOString() + '\n' + stack + '\n\n'); } catch {}
});
process.on('unhandledRejection', (r)  => { safeLog(`[plugin] unhandledRejection: ${r}`); });

const PID_FILE = '/tmp/totalmix-ex.pid';
(function claimSingleInstance() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid && pid !== process.pid) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
  } catch { /* no pid file yet */ }
  fs.writeFileSync(PID_FILE, String(process.pid));
  process.on('exit', () => { try { fs.unlinkSync(PID_FILE); } catch {} });
})();

streamDeck.actions.registerAction(new GlobalMute());
streamDeck.actions.registerAction(new GlobalSolo());
streamDeck.actions.registerAction(new ChannelMute());
streamDeck.actions.registerAction(new ChannelSolo());
streamDeck.actions.registerAction(new ChannelVolumeUp());
streamDeck.actions.registerAction(new ChannelVolumeDown());
streamDeck.actions.registerAction(new ChannelVolumeDial());
streamDeck.actions.registerAction(new BusSelect());
streamDeck.actions.registerAction(new Snapshot());
streamDeck.actions.registerAction(new ChannelPhantom());
streamDeck.actions.registerAction(new MainVolumeUp());
streamDeck.actions.registerAction(new MainVolumeDown());
streamDeck.actions.registerAction(new ChannelPanDial());
streamDeck.actions.registerAction(new Dim());
streamDeck.actions.registerAction(new Talkback());

streamDeck.connect();
