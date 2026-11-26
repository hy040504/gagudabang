import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUploadedImage, stripJpegApp1Segments } from '../src/server/services/media.js';
import { AppError } from '../src/server/lib.js';
import { GPS_MARK, jpegWithGps } from './helpers.js';

const isUnsupported = (e: unknown) => e instanceof AppError && e.status === 415 && e.code === 'UNSUPPORTED_MEDIA';

test('JPEG: APP1(EXIF/GPS) 세그먼트는 제거되고 SOI·SOS 이후 픽셀 데이터는 그대로다', () => {
  const src = jpegWithGps();
  assert.ok(src.includes(GPS_MARK), '전제: 원본에 GPS 문자열이 있어야 한다');
  const { mime, clean } = sanitizeUploadedImage(src);
  assert.equal(mime, 'image/jpeg');
  assert.ok(!clean.includes(GPS_MARK), 'GPS 문자열 잔존');
  assert.ok(!clean.includes(Buffer.from('Exif')), 'Exif 헤더 잔존');
  assert.deepEqual([...clean.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...clean.subarray(-2)], [0xff, 0xd9]);
  assert.ok(clean.includes(Buffer.from([0xff, 0xda, 0x00, 0x02, 1, 2, 3])), '스캔 데이터 손상');
});

test('JPEG: APP1이 여러 개여도 모두 제거하고 APP0 등 다른 세그먼트는 보존한다', () => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]);
  const app1 = (s: string) => { const d = Buffer.from(s); const l = Buffer.alloc(2); l.writeUInt16BE(d.length + 2); return Buffer.concat([Buffer.from([0xff, 0xe1]), l, d]); };
  const src = Buffer.concat([Buffer.from([0xff, 0xd8]), app1('GPS-1'), app0, app1('XMP-2'), Buffer.from([0xff, 0xda, 0x00, 0x02, 9, 0xff, 0xd9])]);
  const out = stripJpegApp1Segments(src);
  assert.ok(!out.includes(Buffer.from('GPS-1')) && !out.includes(Buffer.from('XMP-2')));
  assert.ok(out.includes(app0));
});

test('JPEG: 세그먼트 길이가 파일을 넘는 손상 파일은 415로 거부한다', () => {
  const broken = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]);
  assert.throws(() => sanitizeUploadedImage(broken), isUnsupported);
});

test('PNG: eXIf/tEXt 청크 제거, IHDR·IDAT·IEND는 보존', () => {
  const chunk = (type: string, data: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); return Buffer.concat([l, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); };
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13)), chunk('eXIf', Buffer.from(GPS_MARK)), chunk('tEXt', Buffer.from('Comment\0secret')), chunk('IDAT', Buffer.from([1, 2])), chunk('IEND', Buffer.alloc(0)),
  ]);
  const { mime, clean } = sanitizeUploadedImage(png);
  assert.equal(mime, 'image/png');
  for (const needle of [GPS_MARK, 'eXIf', 'tEXt', 'secret']) assert.ok(!clean.includes(Buffer.from(needle)), needle);
  for (const keep of ['IHDR', 'IDAT', 'IEND']) assert.ok(clean.includes(Buffer.from(keep)), keep);
});

test('WebP: RIFF....WEBP 시그니처는 허용', () => {
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('VP8 ')]);
  assert.equal(sanitizeUploadedImage(webp).mime, 'image/webp');
});

test('확장자만 이미지인 위장 파일(HTML·EXE·빈 파일·RIFF지만 WEBP 아님)은 415', () => {
  for (const bad of [Buffer.from('<html><script>alert(1)</script>'), Buffer.from('MZ\x90\x00'), Buffer.alloc(0), Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])]) {
    assert.throws(() => sanitizeUploadedImage(bad), isUnsupported);
  }
});
