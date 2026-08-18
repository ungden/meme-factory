import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  stripImageMetadata,
  stripImageMetadataFromBase64,
} from "./image-metadata";

// ============================================
// Builders — dựng file tối giản nhưng đúng cấu trúc container
// ============================================

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint32LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function pngChunk(type: string, data: number[] = []): number[] {
  // CRC không được kiểm tra khi strip (chunk giữ lại được copy nguyên khối nên
  // CRC gốc vẫn đúng), nên test dùng placeholder.
  return [...uint32BE(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

function buildPng(chunks: number[][]): Uint8Array {
  return new Uint8Array([...PNG_SIGNATURE, ...chunks.flat()]);
}

function jpegSegment(marker: number, data: number[]): number[] {
  const length = data.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...data];
}

function webpChunk(fourCC: string, data: number[]): number[] {
  const padding = data.length % 2 === 1 ? [0] : [];
  return [...ascii(fourCC), ...uint32LE(data.length), ...data, ...padding];
}

function buildWebp(chunks: number[][]): Uint8Array {
  const payload = [...ascii("WEBP"), ...chunks.flat()];
  return new Uint8Array([...ascii("RIFF"), ...uint32LE(payload.length), ...payload]);
}

function chunkTypesOf(png: Uint8Array): string[] {
  const types: string[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= png.length) {
    const length =
      (png[offset] << 24) + (png[offset + 1] << 16) + (png[offset + 2] << 8) + png[offset + 3];
    types.push(String.fromCharCode(...png.subarray(offset + 4, offset + 8)));
    offset += 12 + length;
  }
  return types;
}

// ============================================

describe("stripImageMetadata — PNG", () => {
  it("gỡ text chunk, EXIF, C2PA và color profile nhưng giữ nguyên dữ liệu ảnh", () => {
    const idat = [1, 2, 3, 4, 5];
    const png = buildPng([
      pngChunk("IHDR", new Array(13).fill(7)),
      pngChunk("iCCP", ascii("ICC Profile")),
      pngChunk("eXIf", ascii("exif payload")),
      pngChunk("iTXt", ascii("XML:com.adobe.xmp")),
      pngChunk("tEXt", ascii("Software\0Gemini")),
      pngChunk("caBX", ascii("c2pa manifest")),
      pngChunk("IDAT", idat),
      pngChunk("IEND"),
    ]);

    const result = stripImageMetadata(png);

    expect(result.format).toBe("png");
    expect(result.removed).toEqual(["iCCP", "eXIf", "iTXt", "tEXt", "caBX"]);
    expect(chunkTypesOf(result.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(result.bytesRemoved).toBeGreaterThan(0);
    expect(result.bytes.length).toBe(png.length - result.bytesRemoved);
    // Pixel data phải nguyên vẹn — không hề re-encode.
    expect(Array.from(result.bytes).join(",")).toContain(idat.join(","));
  });

  it("giữ các chunk cần cho render, gồm cả bảng màu, transparency và APNG", () => {
    const png = buildPng([
      pngChunk("IHDR", new Array(13).fill(0)),
      pngChunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0]),
      pngChunk("PLTE", [255, 0, 0]),
      pngChunk("tRNS", [128]),
      pngChunk("zTXt", ascii("comment")),
      pngChunk("fcTL", new Array(26).fill(0)),
      pngChunk("IDAT", [9, 9]),
      pngChunk("fdAT", [0, 0, 0, 1, 8]),
      pngChunk("IEND"),
    ]);

    const result = stripImageMetadata(png);

    expect(result.removed).toEqual(["zTXt"]);
    expect(chunkTypesOf(result.bytes)).toEqual([
      "IHDR",
      "acTL",
      "PLTE",
      "tRNS",
      "fcTL",
      "IDAT",
      "fdAT",
      "IEND",
    ]);
  });

  it("cắt bỏ dữ liệu nhét thêm sau IEND", () => {
    const png = buildPng([
      pngChunk("IHDR", new Array(13).fill(0)),
      pngChunk("IDAT", [1]),
      pngChunk("IEND"),
      ascii("APPENDED-METADATA"),
    ]);

    const result = stripImageMetadata(png);

    expect(result.removed).toEqual(["TRAILER"]);
    expect(chunkTypesOf(result.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("trả nguyên bytes khi ảnh vốn đã sạch", () => {
    const png = buildPng([
      pngChunk("IHDR", new Array(13).fill(0)),
      pngChunk("IDAT", [1, 2]),
      pngChunk("IEND"),
    ]);

    const result = stripImageMetadata(png);

    expect(result.removed).toEqual([]);
    expect(result.bytesRemoved).toBe(0);
    expect(result.bytes).toBe(png);
  });

  it("không phá ảnh khi chunk khai báo độ dài vượt quá file", () => {
    const png = new Uint8Array([
      ...PNG_SIGNATURE,
      ...uint32BE(0xffff),
      ...ascii("IDAT"),
      1,
      2,
      3,
    ]);

    const result = stripImageMetadata(png);

    expect(result.bytesRemoved).toBe(0);
    expect(result.bytes).toBe(png);
  });
});

describe("stripImageMetadata — JPEG", () => {
  it("gỡ EXIF/XMP/ICC/IPTC/comment nhưng giữ JFIF và dữ liệu nén", () => {
    const scanData = [0x12, 0x34, 0xff, 0x00, 0x56];
    const jpeg = new Uint8Array([
      0xff,
      0xd8, // SOI
      ...jpegSegment(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
      ...jpegSegment(0xe1, ascii("Exif\0\0<gps data>")),
      ...jpegSegment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>")),
      ...jpegSegment(0xe2, ascii("ICC_PROFILE\0")),
      ...jpegSegment(0xeb, ascii("JP\0\0c2pa jumbf")),
      ...jpegSegment(0xed, ascii("Photoshop 3.0\0IPTC")),
      ...jpegSegment(0xfe, ascii("Generated by AI")),
      ...jpegSegment(0xdb, new Array(65).fill(1)), // DQT
      ...jpegSegment(0xc0, new Array(15).fill(2)), // SOF0
      ...jpegSegment(0xda, new Array(10).fill(3)), // SOS
      ...scanData,
      0xff,
      0xd9, // EOI
    ]);

    const result = stripImageMetadata(jpeg);

    expect(result.format).toBe("jpeg");
    expect(result.removed).toEqual(["APP1", "APP1", "APP2", "APP11", "APP13", "COM"]);

    const out = Array.from(result.bytes);
    expect(out.slice(0, 2)).toEqual([0xff, 0xd8]);
    expect(out.slice(-2)).toEqual([0xff, 0xd9]);
    expect(String.fromCharCode(...out)).toContain("JFIF");
    expect(String.fromCharCode(...out)).not.toContain("Exif");
    expect(String.fromCharCode(...out)).not.toContain("xmpmeta");
    expect(String.fromCharCode(...out)).not.toContain("Generated by AI");
    // Entropy-coded data phải được copy nguyên khối, kể cả byte stuffing FF 00.
    expect(out.join(",")).toContain(scanData.join(","));
  });

  it("cắt bỏ dữ liệu thừa sau EOI", () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      ...jpegSegment(0xda, [0, 0]),
      0x11,
      0x22,
      0xff,
      0xd9,
      ...ascii("TRAILING JUNK"),
    ]);

    const result = stripImageMetadata(jpeg);

    expect(result.removed).toEqual(["TRAILER"]);
    expect(Array.from(result.bytes).slice(-2)).toEqual([0xff, 0xd9]);
    expect(String.fromCharCode(...result.bytes)).not.toContain("TRAILING JUNK");
  });

  it("không đụng tới ảnh chỉ có JFIF", () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      ...jpegSegment(0xe0, ascii("JFIF\0")),
      ...jpegSegment(0xda, [0, 0]),
      0x42,
      0xff,
      0xd9,
    ]);

    const result = stripImageMetadata(jpeg);

    expect(result.removed).toEqual([]);
    expect(result.bytes).toBe(jpeg);
  });
});

describe("stripImageMetadata — WebP", () => {
  it("gỡ EXIF/XMP/ICCP, tắt cờ trong VP8X và tính lại kích thước RIFF", () => {
    const webp = buildWebp([
      // flags byte: ICC (0x20) | Alpha (0x10) | EXIF (0x08) | XMP (0x04)
      webpChunk("VP8X", [0x3c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      webpChunk("ICCP", ascii("icc")),
      webpChunk("ALPH", [1, 2, 3]),
      webpChunk("VP8 ", [4, 5, 6, 7]),
      webpChunk("EXIF", ascii("exif payload")),
      webpChunk("XMP ", ascii("<x:xmpmeta/>")),
    ]);

    const result = stripImageMetadata(webp);

    expect(result.format).toBe("webp");
    expect(result.removed).toEqual(["ICCP", "EXIF", "XMP"]);

    const text = String.fromCharCode(...result.bytes);
    expect(text).not.toContain("exif payload");
    expect(text).not.toContain("xmpmeta");
    expect(text).toContain("ALPH");
    expect(text).toContain("VP8 ");

    // Cờ ICC/EXIF/XMP bị xoá, cờ Alpha (0x10) giữ nguyên.
    const vp8xFlags = result.bytes[20];
    expect(vp8xFlags).toBe(0x10);

    // RIFF size phải khớp với phần payload còn lại.
    const riffSize =
      result.bytes[4] +
      (result.bytes[5] << 8) +
      (result.bytes[6] << 16) +
      (result.bytes[7] << 24);
    expect(riffSize).toBe(result.bytes.length - 8);
  });
});

describe("stripImageMetadata — định dạng khác", () => {
  it("trả nguyên bytes cho container không nhận diện được", () => {
    const gif = new Uint8Array([...ascii("GIF89a"), 1, 2, 3, 4]);

    const result = stripImageMetadata(gif);

    expect(result.format).toBe("unknown");
    expect(result.bytes).toBe(gif);
    expect(result.bytesRemoved).toBe(0);
  });

  it("không nổ với input rỗng", () => {
    const result = stripImageMetadata(new Uint8Array(0));
    expect(result.bytes.length).toBe(0);
  });
});

describe("round-trip trên PNG thật", () => {
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function realChunk(type: string, data: Uint8Array): number[] {
    const body = new Uint8Array([...ascii(type), ...data]);
    return [...uint32BE(data.length), ...body, ...uint32BE(crc32(body))];
  }

  /** Đọc lại PNG, kiểm CRC từng chunk và trả về IDAT đã ghép. */
  function parsePng(png: Uint8Array): { types: string[]; idat: Uint8Array } {
    const types: string[] = [];
    const idatParts: Uint8Array[] = [];
    let offset = PNG_SIGNATURE.length;

    while (offset + 8 <= png.length) {
      const length =
        (png[offset] << 24) + (png[offset + 1] << 16) + (png[offset + 2] << 8) + png[offset + 3];
      const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
      const body = png.subarray(offset + 4, offset + 8 + length);
      const storedCrc =
        ((png[offset + 8 + length] << 24) >>> 0) +
        (png[offset + 9 + length] << 16) +
        (png[offset + 10 + length] << 8) +
        png[offset + 11 + length];

      expect(crc32(body), `CRC hỏng ở chunk ${type}`).toBe(storedCrc);

      types.push(type);
      if (type === "IDAT") idatParts.push(png.subarray(offset + 8, offset + 8 + length));
      offset += 12 + length;
    }

    const idat = new Uint8Array(idatParts.reduce((sum, part) => sum + part.length, 0));
    let cursor = 0;
    for (const part of idatParts) {
      idat.set(part, cursor);
      cursor += part.length;
    }
    return { types, idat };
  }

  it("giữ ảnh decode được và pixel y hệt sau khi gỡ metadata", () => {
    const width = 4;
    const height = 4;
    const scanlines: number[] = [];
    for (let y = 0; y < height; y += 1) {
      scanlines.push(0); // filter byte
      for (let x = 0; x < width; x += 1) scanlines.push((x * 40) % 256, (y * 40) % 256, 128);
    }
    const pixels = new Uint8Array(scanlines);

    const ihdr = new Uint8Array([
      ...uint32BE(width),
      ...uint32BE(height),
      8, // bit depth
      2, // color type: truecolour
      0,
      0,
      0,
    ]);

    const png = new Uint8Array([
      ...PNG_SIGNATURE,
      ...realChunk("IHDR", ihdr),
      ...realChunk("tEXt", new Uint8Array(ascii("Software\0Gemini Nano Banana"))),
      ...realChunk("iTXt", new Uint8Array(ascii("XML:com.adobe.xmp\0\0\0\0<x:xmpmeta/>"))),
      ...realChunk("eXIf", new Uint8Array(ascii("II*\0exif kèm toạ độ GPS"))),
      ...realChunk("caBX", new Uint8Array(ascii("c2pa manifest: generated by AI"))),
      ...realChunk("IDAT", new Uint8Array(zlib.deflateSync(pixels))),
      ...realChunk("IEND", new Uint8Array(0)),
    ]);

    // Ảnh gốc đúng chuẩn và có metadata.
    expect(parsePng(png).types).toEqual([
      "IHDR",
      "tEXt",
      "iTXt",
      "eXIf",
      "caBX",
      "IDAT",
      "IEND",
    ]);

    const result = stripImageMetadata(png);
    const parsed = parsePng(result.bytes); // parsePng tự assert CRC còn đúng

    expect(parsed.types).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(new Uint8Array(zlib.inflateSync(parsed.idat))).toEqual(pixels);

    const text = Buffer.from(result.bytes).toString("latin1");
    expect(text).not.toContain("Gemini Nano Banana");
    expect(text).not.toContain("xmpmeta");
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("c2pa");
  });
});

describe("stripImageMetadataFromBase64", () => {
  const dirtyPng = buildPng([
    pngChunk("IHDR", new Array(13).fill(0)),
    pngChunk("tEXt", ascii("Software\0Gemini")),
    pngChunk("IDAT", [1, 2, 3]),
    pngChunk("IEND"),
  ]);

  it("gỡ metadata từ base64 trần", () => {
    const cleaned = stripImageMetadataFromBase64(
      Buffer.from(dirtyPng).toString("base64")
    );

    const bytes = new Uint8Array(Buffer.from(cleaned, "base64"));
    expect(chunkTypesOf(bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("giữ nguyên prefix data URL", () => {
    const input = `data:image/png;base64,${Buffer.from(dirtyPng).toString("base64")}`;

    const cleaned = stripImageMetadataFromBase64(input);

    expect(cleaned.startsWith("data:image/png;base64,")).toBe(true);
    const bytes = new Uint8Array(
      Buffer.from(cleaned.slice("data:image/png;base64,".length), "base64")
    );
    expect(chunkTypesOf(bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("trả nguyên chuỗi khi input không phải ảnh hợp lệ", () => {
    expect(stripImageMetadataFromBase64("")).toBe("");
    expect(stripImageMetadataFromBase64("not-base64-@@@")).toBe("not-base64-@@@");
  });
});
