import { readFileSync, statSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

/**
 * 의존성 없는 ZIP 작성기. package-theme 와 package-api 가 같이 쓴다.
 * 항목: { absolutePath, archivePath } 목록. ZIP64 는 지원하지 않는다.
 */

function makeCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

const crc32Table = makeCrc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function uint16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

export function zipArchive(files, { fail = (message) => { throw new Error(message); } } = {}) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  for (const file of files) {
    const original = readFileSync(file.absolutePath);
    const compressed = deflateRawSync(original, { level: 9 });
    const fileName = Buffer.from(file.archivePath, 'utf8');
    const checksum = crc32(original);
    const stat = statSync(file.absolutePath);
    const { date, time } = dosDateTime(stat.mtime);

    if (original.length > 0xffffffff || compressed.length > 0xffffffff || offset > 0xffffffff) {
      fail(`ZIP64 is not supported by this package script: ${file.archivePath}`);
    }

    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(8),
      uint16(time),
      uint16(date),
      uint32(checksum),
      uint32(compressed.length),
      uint32(original.length),
      uint16(fileName.length),
      uint16(0),
      fileName,
    ]);

    chunks.push(localHeader, compressed);

    centralDirectory.push(Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(8),
      uint16(time),
      uint16(date),
      uint32(checksum),
      uint32(compressed.length),
      uint32(original.length),
      uint16(fileName.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      fileName,
    ]));

    offset += localHeader.length + compressed.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectoryBuffer = Buffer.concat(centralDirectory);
  const endOfCentralDirectory = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectoryBuffer.length),
    uint32(centralDirectoryOffset),
    uint16(0),
  ]);

  return Buffer.concat([...chunks, centralDirectoryBuffer, endOfCentralDirectory]);
}
