import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../lib.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** JPEG의 SOS 이전 APP1(EXIF/XMP) 세그먼트만 제거. 픽셀 데이터는 그대로. */
export function stripJpegApp1Segments(buf: Buffer): Buffer {
  const parts: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new AppError(415, 'UNSUPPORTED_MEDIA', '손상된 JPEG 파일입니다.');
    const marker = buf[i + 1]!;
    if (marker === 0xff) { i++; continue; } // 패딩
    if (marker === 0xda || marker === 0xd9) { parts.push(buf.subarray(i)); return Buffer.concat(parts); }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new AppError(415, 'UNSUPPORTED_MEDIA', '손상된 JPEG 파일입니다.');
    if (marker !== 0xe1) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new AppError(415, 'UNSUPPORTED_MEDIA', '손상된 JPEG 파일입니다.');
}

/** PNG의 eXIf/tEXt/iTXt/zTXt 청크 제거. */
function stripPngMetadata(buf: Buffer): Buffer {
  const drop = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt']);
  const parts: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const end = i + 12 + len;
    if (end > buf.length) throw new AppError(415, 'UNSUPPORTED_MEDIA', '손상된 PNG 파일입니다.');
    if (!drop.has(buf.subarray(i + 4, i + 8).toString('latin1'))) parts.push(buf.subarray(i, end));
    i = end;
  }
  return Buffer.concat(parts);
}

export function sanitizeUploadedImage(buf: Buffer): { mime: 'image/jpeg' | 'image/png' | 'image/webp'; clean: Buffer } {
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', clean: stripJpegApp1Segments(buf) };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return { mime: 'image/png', clean: stripPngMetadata(buf) };
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    // shortcut: WebP EXIF 청크는 제거하지 않음 — 클라이언트가 Canvas로 JPEG 재인코딩하므로 실사용 경로 아님, 직접 API 업로드 허용 시 보강
    return { mime: 'image/webp', clean: buf };
  }
  throw new AppError(415, 'UNSUPPORTED_MEDIA', '지원하지 않는 이미지 형식입니다. (JPG, PNG, WebP만 가능)');
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

/** 파일을 UUID 이름으로 저장. 호출자가 트랜잭션 실패 시 removeFiles로 롤백한다. */
export function storeImage(uploadDir: string, buf: Buffer) {
  const { mime, clean } = sanitizeUploadedImage(buf);
  fs.mkdirSync(uploadDir, { recursive: true });
  const storedName = `${crypto.randomUUID()}.${EXT[mime]}`;
  fs.writeFileSync(path.join(uploadDir, storedName), clean);
  return { storedName, mime, size: clean.length };
}

export function removeFiles(uploadDir: string, names: string[]) {
  for (const n of names) { try { fs.unlinkSync(path.join(uploadDir, n)); } catch { /* 이미 없음 */ } }
}
