// A small PNG reader and writer for scripts/render-images.mjs, with no
// dependencies. It reads the 8-bit RGB and RGBA files that Chrome writes,
// crops them and writes them back with better compression.

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Returns { width, height, data } with data as RGBA bytes.
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let pos = 8;
  let header = null;
  const parts = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('latin1', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12]
      };
    } else if (type === 'IDAT') {
      parts.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }
  if (!header) throw new Error('PNG without a header');
  const { width, height, depth, colorType, interlace } = header;
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error('unsupported PNG: depth ' + depth + ', colour type ' + colorType + ', interlace ' + interlace);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const data = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 255;
      else if (filter !== 0) throw new Error('unknown PNG filter ' + filter);
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = line[x * channels];
      data[o + 1] = line[x * channels + 1];
      data[o + 2] = line[x * channels + 2];
      data[o + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    previous = line;
  }
  return { width, height, data };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

// Writes RGB when every pixel is opaque, RGBA otherwise. Each row gets the
// filter with the smallest sum of absolute differences, as libpng does.
export function encodePng(image) {
  const { width, height, data } = image;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) { opaque = false; break; }
  }
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  let previous = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  const candidates = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      for (let k = 0; k < channels; k++) line[x * channels + k] = data[o + k];
    }
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = candidates[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? line[i - channels] : 0;
        const b = previous[i];
        const c = i >= channels ? previous[i - channels] : 0;
        let v = line[i];
        if (f === 1) v -= a;
        else if (f === 2) v -= b;
        else if (f === 3) v -= (a + b) >> 1;
        else if (f === 4) v -= paeth(a, b, c);
        v &= 255;
        out[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    raw[y * (stride + 1)] = best;
    candidates[best].copy(raw, y * (stride + 1) + 1);
    previous = Buffer.from(line);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = opaque ? 2 : 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export function crop(image, x, y, width, height) {
  if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) {
    throw new Error('crop ' + [x, y, width, height].join(',') + ' is outside ' + image.width + 'x' + image.height);
  }
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4;
    image.data.copy(data, row * width * 4, from, from + width * 4);
  }
  return { width, height, data };
}

// Number of different colours among a sample of pixels: a cheap check that a
// picture is not blank.
export function colourCount(image, step = 7) {
  const seen = new Set();
  for (let i = 0; i < image.width * image.height; i += step) {
    seen.add(image.data.readUInt32BE(i * 4));
  }
  return seen.size;
}

// The highest alpha value on the outer edge: 0 means nothing was cut off.
export function edgeAlpha(image) {
  let max = 0;
  const { width, height, data } = image;
  for (let x = 0; x < width; x++) {
    max = Math.max(max, data[x * 4 + 3], data[((height - 1) * width + x) * 4 + 3]);
  }
  for (let y = 0; y < height; y++) {
    max = Math.max(max, data[(y * width) * 4 + 3], data[(y * width + width - 1) * 4 + 3]);
  }
  return max;
}
