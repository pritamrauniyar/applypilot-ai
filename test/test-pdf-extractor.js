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

// ==========================================================================
// PNG predictors, ToUnicode CMaps, and Unicode preservation
// ==========================================================================

const {
  undoPngPredictor,
  applyDecodeParms,
  parseToUnicodeCMap,
  decodeHexWithCMap,
  cleanPdfText
} = require('../lib/pdf-extractor.js');

// Encode rows with a given PNG filter so the decoder can be checked round-trip.
function encodePngRows(rows, filterType, bpp) {
  const rowLength = rows[0].length;
  const out = [];
  let prev = new Array(rowLength).fill(0);

  for (const row of rows) {
    out.push(filterType);
    for (let i = 0; i < rowLength; i++) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let encoded;
      switch (filterType) {
        case 0: encoded = row[i]; break;
        case 1: encoded = row[i] - left; break;
        case 2: encoded = row[i] - up; break;
        case 3: encoded = row[i] - ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
          encoded = row[i] - pred;
          break;
        }
        default: encoded = row[i];
      }
      out.push(encoded & 0xff);
    }
    prev = row;
  }
  return new Uint8Array(out);
}

test('PdfExtractor: undoPngPredictor reverses every PNG filter type', () => {
  const rows = [
    [10, 20, 30, 40],
    [15, 25, 35, 45],
    [12, 22, 32, 42]
  ];

  // Filters 0 (None) through 4 (Paeth), one byte per component.
  for (const filterType of [0, 1, 2, 3, 4]) {
    const encoded = encodePngRows(rows, filterType, 1);
    const decoded = undoPngPredictor(encoded, 1, 8, 4);
    const flat = rows.flat();
    assert.deepStrictEqual(
      Array.from(decoded),
      flat,
      `filter ${filterType} must round-trip`
    );
  }
});

test('PdfExtractor: undoPngPredictor tolerates malformed input', () => {
  // Too short to contain a single row - returned unchanged rather than throwing.
  const tiny = new Uint8Array([1, 2]);
  assert.deepStrictEqual(Array.from(undoPngPredictor(tiny, 1, 8, 64)), [1, 2]);

  // An unknown filter byte falls back to passthrough for that row.
  const weird = new Uint8Array([99, 7, 8, 9]);
  const out = undoPngPredictor(weird, 1, 8, 3);
  assert.deepStrictEqual(Array.from(out), [7, 8, 9]);
});

test('PdfExtractor: applyDecodeParms honours the stream dictionary', () => {
  const rows = [[5, 6, 7], [8, 9, 10]];
  const encoded = encodePngRows(rows, 2, 1);

  // No dictionary, or no predictor, means no transformation.
  assert.strictEqual(applyDecodeParms(encoded, null), encoded);
  assert.strictEqual(applyDecodeParms(encoded, '<< /Filter /FlateDecode >>'), encoded);

  // TIFF predictor 2 is not handled and must pass through untouched.
  assert.strictEqual(applyDecodeParms(encoded, '<< /Predictor 2 /Columns 3 >>'), encoded);

  // A PNG predictor is reversed using the declared geometry.
  const decoded = applyDecodeParms(encoded, '<< /Predictor 12 /Colors 1 /BitsPerComponent 8 /Columns 3 >>');
  assert.deepStrictEqual(Array.from(decoded), [5, 6, 7, 8, 9, 10]);
});

test('PdfExtractor: parseToUnicodeCMap reads bfchar and bfrange sections', () => {
  const cmap = `
/CIDInit /ProcSet findresource begin
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
3 beginbfchar
<0003> <0041>
<0004> <0042>
<0005> <2014>
endbfchar
1 beginbfrange
<0010> <0012> <0061>
endbfrange
endcmap
`;

  const map = parseToUnicodeCMap(cmap);
  assert.strictEqual(map.get(0x0003), 'A');
  assert.strictEqual(map.get(0x0004), 'B');
  assert.strictEqual(map.get(0x0005), '—');
  // Range 0x10-0x12 maps onto 'a', 'b', 'c'.
  assert.strictEqual(map.get(0x0010), 'a');
  assert.strictEqual(map.get(0x0011), 'b');
  assert.strictEqual(map.get(0x0012), 'c');

  // Empty and malformed input yields an empty map rather than throwing.
  assert.strictEqual(parseToUnicodeCMap('').size, 0);
  assert.strictEqual(parseToUnicodeCMap(null).size, 0);
});

test('PdfExtractor: decodeHexWithCMap maps subset-font glyph ids to text', () => {
  const cmap = new Map([
    [0x0003, 'H'],
    [0x0004, 'i']
  ]);

  // Glyph ids that mean nothing without the CMap decode to real characters.
  assert.strictEqual(decodeHexWithCMap('00030004', cmap), 'Hi');

  // With no CMap available, fall back to the plain interpretation.
  assert.strictEqual(decodeHexWithCMap('48656c6c6f', new Map()), 'Hello');
  assert.strictEqual(decodeHexWithCMap('48656c6c6f', null), 'Hello');

  // A string the CMap cannot explain falls back rather than returning junk.
  assert.strictEqual(decodeHexWithCMap('00410042', cmap), decodePdfHexString('00410042'));

  // Odd-length (non 4-hex-aligned) input falls back too.
  assert.strictEqual(decodeHexWithCMap('486', cmap), decodePdfHexString('486'));
});

test('PdfExtractor: cleanPdfText keeps accented and non-Latin characters', () => {
  // The previous ASCII-only filter destroyed these; real resumes contain them.
  assert.strictEqual(cleanPdfText('Jose Munoz'), 'Jose Munoz');
  assert.strictEqual(cleanPdfText('José Muñoz'), 'José Muñoz');
  assert.strictEqual(cleanPdfText('القاهرة'), 'القاهرة');
  assert.strictEqual(cleanPdfText('北京大学'), '北京大学');
  assert.strictEqual(cleanPdfText('Résumé — Senior Engineer'), 'Résumé — Senior Engineer');

  // Control characters and replacement chars are still stripped.
  assert.strictEqual(cleanPdfText('A BC'), 'A B C');
  assert.strictEqual(cleanPdfText('A�B'), 'A B');

  // Whitespace is collapsed and trimmed as before.
  assert.strictEqual(cleanPdfText('  spaced   out  '), 'spaced out');
});
