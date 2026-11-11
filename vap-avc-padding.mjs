// H.264 SPS values are read from RBSP, with the NAL header and emulation
// prevention bytes removed. The bit after the crop fields starts the VUI.
class BitReader {
  constructor(bytes, end) {
    this.bytes = bytes;
    this.end = end;
    this.position = 0;
  }

  read(count = 1) {
    if (this.position + count > this.end) throw new RangeError('Truncated AVC SPS');
    let value = 0;
    while (count-- > 0) value = value * 2 + getBit(this.bytes, this.position++);
    return value;
  }

  unsigned() {
    let zeros = 0;
    while (!this.read()) {
      if (++zeros > 30) throw new RangeError('Oversized AVC SPS value');
    }
    return 2 ** zeros - 1 + this.read(zeros);
  }

  signed() {
    const code = this.unsigned();
    return code % 2 ? (code + 1) / 2 : -code / 2;
  }
}

function getBit(bytes, position) {
  return (bytes[position >>> 3] >>> (7 - (position & 7))) & 1;
}

function removeEmulationPrevention(bytes) {
  const output = new Uint8Array(bytes.length);
  let count = 0, zeros = 0;
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index];
    if (zeros === 2 && byte <= 3) {
      if (byte !== 3 || index + 1 >= bytes.length || bytes[index + 1] > 3) throw new RangeError('Invalid AVC NAL escaping');
      zeros = 0;
      continue;
    }
    output[count++] = byte;
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return output.subarray(0, count);
}

function escapeSps(header, rbsp) {
  const output = new Uint8Array(1 + rbsp.length * 2);
  output[0] = header;
  let count = 1, zeros = 0;
  for (const byte of rbsp) {
    if (zeros === 2 && byte <= 3) {
      output[count++] = 3;
      zeros = 0;
    }
    output[count++] = byte;
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return output.subarray(0, count);
}

function skipScalingLists(bits) {
  for (let list = 0; list < 8; list++) {
    if (!bits.read()) continue;
    let last = 8, next = 8;
    for (let index = 0, size = list < 6 ? 16 : 64; index < size; index++) {
      if (next !== 0) {
        const delta = bits.signed();
        if (delta < -128 || delta > 127) throw new RangeError('Invalid AVC scaling list');
        next = (last + delta + 256) % 256;
      }
      if (next !== 0) last = next;
    }
  }
}

function exposeSpsPadding(sps, visibleWidth, visibleHeight) {
  if (sps.length < 5 || (sps[0] & 0x9f) !== 7 || !(sps[0] & 0x60)) return null;
  const rbsp = removeEmulationPrevention(sps.subarray(1));
  if (!rbsp.at(-1)) return null;
  let stopBit = rbsp.length * 8 - 1;
  while (!getBit(rbsp, stopBit)) stopBit--;
  const bits = new BitReader(rbsp, stopBit);
  const profile = bits.read(8), constraints = bits.read(8);
  bits.read(8); // level_idc
  if (![66, 77, 88, 100].includes(profile) || (constraints & 3) !== 0 || bits.unsigned() > 31) return null;
  if (profile === 100) {
    if (bits.unsigned() !== 1 || bits.unsigned() !== 0 || bits.unsigned() !== 0) return null;
    bits.read(); // qpprime_y_zero_transform_bypass_flag
    if (bits.read()) skipScalingLists(bits);
  }

  if (bits.unsigned() > 12) return null; // log2_max_frame_num_minus4
  const order = bits.unsigned();
  if (order === 0) {
    if (bits.unsigned() > 12) return null;
  } else if (order === 1) {
    bits.read();
    bits.signed();
    bits.signed();
    const offsets = bits.unsigned();
    if (offsets > 255) return null;
    for (let index = 0; index < offsets; index++) bits.signed();
  } else if (order !== 2) return null;
  bits.unsigned(); // max_num_ref_frames
  bits.read(); // gaps_in_frame_num_value_allowed_flag
  const width = 16 * (bits.unsigned() + 1), height = 16 * (bits.unsigned() + 1);
  if (!bits.read()) return null; // frame_mbs_only_flag
  bits.read(); // direct_8x8_inference_flag

  const cropFlagPosition = bits.position;
  const hasCrop = bits.read();
  let right = 0, bottom = 0;
  if (hasCrop) {
    const left = bits.unsigned();
    right = bits.unsigned();
    const top = bits.unsigned();
    bottom = bits.unsigned();
    // Progressive 4:2:0 has two luma samples per crop unit in both directions.
    if (left || top || right > 7 || bottom > 7) return null;
  }
  if (width - right * 2 !== visibleWidth || height - bottom * 2 !== visibleHeight) return null;
  const vuiPosition = bits.position;
  const hasVui = bits.read();
  if (hasVui ? bits.position >= stopBit : bits.position !== stopBit) return null;
  if (!hasCrop) return {sps, width, height};

  // Keep the prefix and the VUI verbatim, set frame_cropping_flag to 0,
  // and pad the relocated rbsp_stop_one_bit to a new byte boundary.
  const suffixStart = cropFlagPosition + 1;
  const output = new Uint8Array(Math.ceil((suffixStart + stopBit - vuiPosition + 1) / 8));
  function copy(from, to, length) {
    for (let index = 0; index < length; index++) {
      const bit = to + index;
      output[bit >>> 3] |= getBit(rbsp, from + index) << (7 - (bit & 7));
    }
  }
  copy(0, 0, cropFlagPosition);
  copy(vuiPosition, suffixStart, stopBit - vuiPosition + 1);
  return {sps: escapeSps(sps[0], output), width, height};
}

/** Return an AVC decoder description exposing the existing right/bottom padding. */
export function exposeAvcPadding(description, visibleWidth, visibleHeight) {
  if (![visibleWidth, visibleHeight].every(value => Number.isSafeInteger(value) && value > 0 && value <= 4096 && value % 2 === 0)) return null;
  try {
    const bytes = ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description);
    if (bytes.length < 11 || bytes.length > 262144 || bytes[0] !== 1 ||
      (bytes[4] & 0xfc) !== 0xfc || (bytes[4] & 3) === 2 || bytes[5] !== 0xe1) return null;
    const end = 8 + (bytes[6] * 256 + bytes[7]);
    if (end <= 12 || end >= bytes.length) return null;
    const sps = bytes.subarray(8, end);
    if (sps[1] !== bytes[1] || sps[2] !== bytes[2] || sps[3] !== bytes[3]) return null;
    let offset = end;
    const count = bytes[offset++];
    if (!count) return null;
    for (let index = 0; index < count; index++) {
      if (offset + 2 >= bytes.length) return null;
      const length = bytes[offset] * 256 + bytes[offset + 1];
      offset += 2;
      if (length < 2 || offset + length > bytes.length || (bytes[offset] & 0x9f) !== 8) return null;
      offset += length;
    }
    // An optional High-profile extension can declare 8-bit 4:2:0 without
    // any auxiliary parameter sets. Preserve it along with all PPS bytes.
    if (offset !== bytes.length && !(bytes[1] === 100 && offset + 4 === bytes.length &&
      bytes[offset] === 0xfd && bytes[offset+1] === 0xf8 && bytes[offset+2] === 0xf8 && bytes[offset+3] === 0)) return null;

    const result = exposeSpsPadding(sps, visibleWidth, visibleHeight);
    if (!result || result.sps.length > 65535) return null;
    const patched = new Uint8Array(8 + result.sps.length + bytes.length - end);
    patched.set(bytes.subarray(0, 6));
    patched[6] = result.sps.length >>> 8;
    patched[7] = result.sps.length & 255;
    patched.set(result.sps, 8);
    patched.set(bytes.subarray(end), 8 + result.sps.length);
    return {description: patched, width: result.width, height: result.height};
  } catch {
    return null;
  }
}
