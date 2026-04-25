# TotalMix Controller — Stream Deck Plugin

Stream Deck plugin to control **RME TotalMix FX** via OSC.

## Features

15 action types covering the most common TotalMix FX operations:

### Global

| Action | Description | LED |
|---|---|---|
| Global Mute | Toggle global mute | ✓ |
| Global Solo | Toggle global solo | ✓ |
| Dim | Toggle output dim | ✓ |
| Talkback | Toggle talkback (or hold-to-talk) | ✓ |

### Bus

| Action | Description | LED |
|---|---|---|
| Bus Select | Switch view bus (Input / Playback / Output) | ✓ Active bus lights up |

### Channel

| Action | Controller | Description | LED |
|---|---|---|---|
| Channel Mute | Keypad | Toggle mute for a channel | ✓ |
| Channel Solo | Keypad | Toggle solo for a channel | ✓ |
| Channel Volume Up | Keypad | Increase channel volume (hold mode supported) | — |
| Channel Volume Down | Keypad | Decrease channel volume (hold mode supported) | — |
| Channel Volume Dial | Encoder | Adjust channel volume; press to toggle mute | — |
| Channel Pan Dial | Encoder | Adjust channel pan; press to reset to center | — |
| Channel Phantom | Keypad | Toggle 48V phantom power | ✓ |

### Snapshot & Volume

| Action | Description | LED |
|---|---|---|
| Snapshot | Recall a TotalMix FX snapshot (1–8) | — |
| Main Volume Up | Increase main output volume (hold mode supported) | — |
| Main Volume Down | Decrease main output volume (hold mode supported) | — |

## Encoder LCD Display (Channel Volume Dial / Channel Pan Dial)

The encoder LCD (Stream Deck+) is fully customizable per action.

### Layout

```
┌──────────────────────────────────────────┐
│  Title (90px)    │  Value (110px)        │  ← top 51px
├──────────────────────────────────────────┤
│  Gauge (200px, segmented bar)            │  ← bottom 47px
└──────────────────────────────────────────┘
```

### LCD Settings (Property Inspector)

| Section | Field | Description |
|---|---|---|
| LCD Title | Label | Custom text (blank = `Ch N` / `Ch N Pan`) |
| LCD Title | Font | Font family |
| LCD Title | Size (px) | Font size |
| LCD Title | Color | Text color |
| LCD | Background | Solid background color |
| LCD | 透過 | Transparent — shows Stream Deck background image through |
| Gauge | Fill | Filled bar color |
| Gauge | Background | Unfilled bar color |

**透過 (Transparent) checkbox**: When checked, `lcdBg` is set to `transparent`; all three LCD elements (title, value, gauge) render without background, revealing whatever background image is set in the Stream Deck software. When unchecked, the solid Background color is applied across the full LCD area.

### Value Display

| Action | Value format |
|---|---|
| Channel Volume Dial | `+6 dB` / `0 dB` / `-∞ dB` / `[MUTED]` |
| Channel Pan Dial | `CTR` / `L64` / `R64` |

### Gauge

- Segmented bar with 20 divisions (semi-transparent overlay dividers)
- Tick marks at 0 / 25 / 50 / 75 / 100 %
- Pointer triangle tracking current value
- Volume dial: fills left → right
- Pan dial: fills from center outward (L/R)

## OSC Address Reference

Key OSC addresses used (from [`OscTableTotalMix_240722.xls`](https://www.rme-audio.de/downloads/osc_table_totalmix_new.zip) — also referenced in the [Digiface USB manual](https://rme-audio.de/downloads/dface_usb_e.pdf)):

| Function | OSC Address | Notes |
|---|---|---|
| Bus Input | `/1/busInput` | value 1.0 |
| Bus Playback | `/1/busPlayback` | value 1.0 |
| Bus Output | `/1/busOutput` | value 1.0 |
| Channel Volume | `/1/volumeN` | 0.0–1.0 (0.75 = 0 dB) |
| Channel Mute | `/1/mute/1/N` | 1.0 = arm, 0.0 = disarm |
| Channel Solo | `/1/solo/1/N` | 1.0 = arm, 0.0 = disarm |
| Channel Pan | `/1/panN` | 0.0 = L, 0.5 = center, 1.0 = R |
| Phantom Power | `/1/phantom/1/N` | 1.0 = ON, 0.0 = OFF |
| Global Mute | `/1/globalMute` | 1.0 = toggle |
| Global Solo | `/1/globalSolo` | 1.0 = toggle |
| Dim | `/1/dim` | 1.0 = toggle |
| Talkback | `/1/talkback` | 1.0 = ON, 0.0 = OFF |
| Main Volume | `/1/mastervolume` | 0.0–1.0 |
| Snapshot N | `/3/snapshots/${9-N}/1` | N=1→`/3/snapshots/8/1`, reversed order |
| Refresh | `/1/refresh` | Request full state feedback |

> TotalMix FX sends OSC feedback in **bundle format**. The plugin handles both bundle and single messages via `parsePacket()`.
>
> The OSC table ZIP (`osc_table_totalmix_new.zip`) contains both `.xls` and `.ods` formats and is also bundled in the TotalMix FX driver package.

## Requirements

- **macOS only** (Windows is not supported)
- **[Elgato Stream Deck+](https://www.elgato.com/stream-deck-plus)** required for encoder dial actions (Channel Volume Dial, Channel Pan Dial); standard Stream Deck models support keypad actions only — tested on **Stream Deck+**
- **Stream Deck software 6.6+** (tested on 7.4)
- [RME TotalMix FX](https://www.rme-audio.de/totalmix-fx.html) 1.99+ with OSC enabled; tested on **RME Digiface USB**
- TotalMix Remote (iOS/Android/standalone) is also supported as an OSC target
- macOS 13 (Ventura) or later recommended

## Setup

### TotalMix FX OSC Configuration

In TotalMix FX: **Mixer Settings → OSC tab**

| Setting | Value |
|---|---|
| Port (incoming) | e.g. `7001` — TotalMix receives OSC here |
| Remote Controller Address Host | IP of the machine running this plugin |
| Port (outgoing) | e.g. `9001` — TotalMix sends feedback here |

### Plugin Settings (per action)

| Field | Description |
|---|---|
| Device | Select a detected RME device, or choose `-- Manual --` to enter IP manually |
| Host IP | IP address of the machine running TotalMix FX (use `127.0.0.1` for local) |
| Send Port | Must match TotalMix FX **incoming** port |
| Recv Port | Must match TotalMix FX **outgoing** port |

The plugin supports **remote TotalMix FX** over the network — just set Host IP to the remote machine's IP address.

## Installation

### Option A — Install from release (recommended)

1. Download the latest `com.hogehoge.totalmix-ex.streamDeckPlugin` from the [Releases](../../releases) page
2. Double-click the file — Stream Deck software installs it automatically

### Option B — Build from source

**Prerequisites**

- [Node.js](https://nodejs.org/) 20+
- [Stream Deck CLI](https://www.npmjs.com/package/@elgato/cli): `npm install -g @elgato/cli`

**Steps**

```bash
# 1. Clone
git clone https://github.com/soresore19xx/totalmix-ex.git
cd totalmix-ex/totalmix-ex

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Link to Stream Deck (creates symlink — no copy needed)
streamdeck link com.hogehoge.totalmix-ex.sdPlugin

# 5. Restart the plugin
streamdeck restart com.hogehoge.totalmix-ex
```

Stream Deck software picks up the plugin automatically after step 4.

## Build (development)

```bash
npm run build          # one-shot build
npm run watch          # watch mode — auto-rebuild and restart on save
```

## Release

To create a distributable `.streamDeckPlugin` file:

```bash
streamdeck pack com.hogehoge.totalmix-ex.sdPlugin
```

This generates `com.hogehoge.totalmix-ex.streamDeckPlugin` which can be attached to a GitHub Release and installed by double-clicking.

## Known Issues

- **`"Debug": "disabled"` causes the plugin not to start**: Stream Deck does not launch the Node.js process when `manifest.json` has `"Nodejs": { "Debug": "disabled" }`. Always use `"Debug": "enabled"` — it only opens a localhost debug port and is safe for production.

## Implementation Notes

- **EPIPE guard**: `stdout`/`stderr` EPIPE errors are absorbed to prevent crash loops when Stream Deck restarts the plugin process.
- **Single-instance guard**: A PID file (`/tmp/totalmix-ex.pid`) terminates any previous instance on startup to prevent zombie processes.
- **Mute/Solo arm-disarm**: TotalMix FX mute/solo is not a simple toggle — the plugin tracks state locally and sends explicit `1.0` (arm) or `0.0` (disarm).
- **Bus tracking**: Channel actions call `ensureBus()` before sending to switch to the correct bus view automatically.
- **Dial debounce**: OSC feedback is ignored for 300 ms after a dial operation to prevent display bounce.

## License

MIT
