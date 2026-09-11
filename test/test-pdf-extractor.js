const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');

// Mock window and self for browser exports
global.window = {};
global.self = {};

const { PdfExtractor, safeDecompress, decodePdfHexString } = require('../lib/pdf-extractor.js');

function toArrayBuffer(str) {
  const buf = Buffer.from(str, 'latin1');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

test('PdfExtractor: decodePdfHexString & safeDecompress', async () => {
  // Odd length
  assert.strictEqual(decodePdfHexString('abc'), '');

  // UTF-16BE with FEFF
  assert.strictEqual(decodePdfHexString('feff00480069'), 'Hi');
  assert.strictEqual(decodePdfHexString('FEFF00480069'), 'Hi');

  // UTF-16BE without FEFF (starts with 00)
  assert.strictEqual(decodePdfHexString('00480069'), 'Hi');

  // ASCII hex and control codes (10, 13, 9)
  // '48' -> 'H', '0a' -> ' ' (10), '69' -> 'i'
  const decodedAscii = decodePdfHexString('480a69');
  assert.strictEqual(decodedAscii, 'H i');

  // Out of range non-printable codes (e.g. 0x01)
  assert.strictEqual(decodePdfHexString('0148'), 'H');

  // safeDecompress fallback when DecompressionStream is undefined
  const origDS = global.DecompressionStream;
  delete global.DecompressionStream;
  const rawBytes = new Uint8Array([1, 2, 3]);
  const resNoDS = await safeDecompress(rawBytes);
  assert.deepStrictEqual(resNoDS, rawBytes);
  if (origDS) global.DecompressionStream = origDS;

  // Decompression error fallback (invalid deflate payload)
  const badDeflate = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
  const resBad = await safeDecompress(badDeflate);
  assert.deepStrictEqual(resBad, badDeflate);
});

test('PdfExtractor: cleanPdfText octal and escape sequences', async () => {
  // Mock file for fallback text extraction
  const mockFileOther = {
    name: 'resume.unknown',
    type: 'application/octet-stream',
    text: async () => 'Pritam\\101\\(Special\\)\\r\\n\\tCandidate'
  };

  const text = await PdfExtractor.extractText(mockFileOther);
  // \101 is 'A', \( -> (, \) -> ), \r\n\t -> spaces
  assert.ok(text.includes('PritamA(Special)'));
  assert.ok(text.includes('Candidate'));

  // Null/empty file
  assert.strictEqual(await PdfExtractor.extractText(null), '');
});

test('PdfExtractor: Plain Text file extraction', async () => {
  const mockTxt = {
    name: 'resume.txt',
    type: 'text/plain',
    text: async () => 'Software Engineer II at Uber - Pritam Rauniyar'
  };

  const res = await PdfExtractor.extractText(mockTxt);
  assert.strictEqual(res, 'Software Engineer II at Uber - Pritam Rauniyar');
});

test('PdfExtractor: Standard PDF Stream, TJ, Tj, Hex, and Array extraction', async () => {
  const streamContent = `
BT
/F1 12 Tf
(Pritam Rauniyar) Tj
(Software Engineer) '
(Uber) "
<476f> Tj
[(Microservices) 15 <4b61666b61>] TJ
ET
`;

  // Deflate compress the stream
  const compressed = zlib.deflateSync(Buffer.from(streamContent, 'utf-8'));
  const pdfBody = `%PDF-1.4\n1 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${compressed.toString('latin1')}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;

  const mockPdfFile = {
    name: 'resume.pdf',
    type: 'application/pdf',
    arrayBuffer: async () => toArrayBuffer(pdfBody)
  };

  const extracted = await PdfExtractor.extractText(mockPdfFile);
  assert.ok(extracted.includes('Pritam Rauniyar'));
  assert.ok(extracted.includes('Software Engineer'));
  assert.ok(extracted.includes('Uber'));
  assert.ok(extracted.includes('Go')); // <476f> is 'Go'
  assert.ok(extracted.includes('Microservices'));
  assert.ok(extracted.includes('Kafka')); // <4b61666b61> is 'Kafka'
});

test('PdfExtractor: Fallback literal Tj outside BT/ET', async () => {
  const pdfBody = `%PDF-1.4\n(Direct Literal Text Outside Operators) Tj\n%%EOF`;

  const mockPdf = {
    name: 'minimal.pdf',
    type: 'application/pdf',
    arrayBuffer: async () => toArrayBuffer(pdfBody)
  };

  const extracted = await PdfExtractor.extractText(mockPdf);
  assert.strictEqual(extracted, 'Direct Literal Text Outside Operators');
});

test('PdfExtractor: Fallback printable ASCII scan', async () => {
  const pdfBody = `%PDF-1.4\nSome raw uncompressed ascii text with details for candidate Pritam Rauniyar\n%%EOF`;

  const mockPdf = {
    name: 'raw.pdf',
    type: 'application/pdf',
    arrayBuffer: async () => toArrayBuffer(pdfBody)
  };

  const extracted = await PdfExtractor.extractText(mockPdf);
  assert.ok(extracted.includes('Pritam Rauniyar'));
});
