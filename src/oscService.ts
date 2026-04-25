import dgram from 'dgram';

export type OscArg = number | string;
export type OscHandler = (address: string, args: OscArg[]) => void;

// OSC encode

function encodeString(s: string): Buffer {
  const padded = s + '\0';
  const len = Math.ceil(padded.length / 4) * 4;
  const buf = Buffer.alloc(len, 0);
  buf.write(s + '\0', 0, 'ascii');
  return buf;
}

function encodeFloat(f: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(f, 0);
  return buf;
}

function buildMessage(address: string, args: OscArg[]): Buffer {
  let typeTags = ',';
  const argBufs: Buffer[] = [];
  for (const a of args) {
    if (typeof a === 'number') { typeTags += 'f'; argBufs.push(encodeFloat(a)); }
    else                       { typeTags += 's'; argBufs.push(encodeString(a)); }
  }
  return Buffer.concat([encodeString(address), encodeString(typeTags), ...argBufs]);
}

// OSC decode

function readString(buf: Buffer, offset: number): { value: string; next: number } {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const value = buf.slice(offset, end).toString('ascii');
  return { value, next: Math.ceil((end + 1) / 4) * 4 };
}

function parseMessage(buf: Buffer): { address: string; args: OscArg[] } | null {
  try {
    const { value: address, next: o1 } = readString(buf, 0);
    const { value: typeTags, next: o2 } = readString(buf, o1);
    const args: OscArg[] = [];
    let offset = o2;
    for (let i = 1; i < typeTags.length; i++) {
      if (typeTags[i] === 'f') { args.push(buf.readFloatBE(offset)); offset += 4; }
      else if (typeTags[i] === 's') { const { value, next } = readString(buf, offset); args.push(value); offset = next; }
    }
    return { address, args };
  } catch { return null; }
}

function parsePacket(buf: Buffer): { address: string; args: OscArg[] }[] {
  if (buf.slice(0, 8).toString('ascii') === '#bundle\0') {
    const messages: { address: string; args: OscArg[] }[] = [];
    let offset = 16; // skip '#bundle\0' + timetag (8 bytes)
    while (offset < buf.length) {
      const size = buf.readInt32BE(offset); offset += 4;
      const msg = parseMessage(buf.slice(offset, offset + size));
      if (msg) messages.push(msg);
      offset += size;
    }
    return messages;
  }
  const msg = parseMessage(buf);
  return msg ? [msg] : [];
}

// Dynamic socket pool — one socket per receive port

type SocketEntry = { socket: dgram.Socket; handlers: Set<OscHandler> };
const recvSockets = new Map<number, SocketEntry>();

function getRecvSocket(recvPort: number): SocketEntry {
  if (!recvSockets.has(recvPort)) {
    const handlers: Set<OscHandler> = new Set();
    const socket = dgram.createSocket('udp4');
    socket.bind(recvPort, () => console.log(`[OSC] recv :${recvPort}`));
    socket.on('message', (raw) => {
      const msgs = parsePacket(raw);
      for (const msg of msgs) {
        for (const h of handlers) {
          try { h(msg.address, msg.args); } catch (e) { console.error('[OSC] handler:', e); }
        }
      }
    });
    socket.on('error', (err) => console.error(`[OSC] :${recvPort} error:`, err.message));
    recvSockets.set(recvPort, { socket, handlers });
  }
  return recvSockets.get(recvPort)!;
}

// Single shared send socket
const sendSocket = dgram.createSocket('udp4');
sendSocket.bind(0, () => { /* ephemeral port */ });
sendSocket.on('error', (err) => console.error('[OSC] send socket:', err.message));

export function sendOsc(host: string, sendPort: number, address: string, ...args: OscArg[]): void {
  const buf = buildMessage(address, args);
  sendSocket.send(buf, 0, buf.length, sendPort, host, (err) => {
    if (err) console.error('[OSC] send error:', err.message);
  });
}

export function onOsc(recvPort: number, handler: OscHandler): void {
  getRecvSocket(recvPort).handlers.add(handler);
}

export function offOsc(recvPort: number, handler: OscHandler): void {
  recvSockets.get(recvPort)?.handlers.delete(handler);
}
