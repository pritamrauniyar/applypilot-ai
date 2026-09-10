// ApplyPilot AI - Zero-Dependency PDF & Text File Extractor
// Extracts pure text streams directly in browser without heavy external packages.
// Handles: Deflate (RFC 1950), Deflate-Raw (RFC 1951), Hex strings <...>, TJ arrays, UTF-16BE.

async function safeDecompress(bytes) {
  if (typeof DecompressionStream === 'undefined') return bytes;
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(format);
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      const res = await new Response(stream).arrayBuffer();
      return new Uint8Array(res);
    } catch (e) {
      // Try next format
    }
  }
  return bytes;
}

function decodePdfHexString(hex) {
  const cleanHex = hex.replace(/\s+/g, '');
  if (cleanHex.length % 2 !== 0) return '';
  
  // Check if UTF-16BE (starts with FEFF or contains 00xx patterns)
  const isUtf16 = cleanHex.startsWith('feff') || cleanHex.startsWith('FEFF') || 
                  (cleanHex.length >= 4 && cleanHex.substring(0, 2) === '00');

  let str = '';
  if (isUtf16) {
    const start = (cleanHex.startsWith('feff') || cleanHex.startsWith('FEFF')) ? 4 : 0;
    for (let i = start; i < cleanHex.length; i += 4) {
      const code = parseInt(cleanHex.substring(i, i + 4), 16);
      if (!isNaN(code) && code > 0) str += String.fromCharCode(code);
    }
  } else {
    for (let i = 0; i < cleanHex.length; i += 2) {
      const code = parseInt(cleanHex.substring(i, i + 2), 16);
      if (!isNaN(code) && code >= 32 && code <= 126) str += String.fromCharCode(code);
      else if (code === 10 || code === 13 || code === 9) str += ' ';
    }
  }
  return str;
}

function cleanPdfText(text) {
  return text
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\r/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PdfExtractor = {
  // Read File object (PDF, DOCX, TXT) and extract text
  async extractText(file) {
    if (!file) return "";

    const name = (file.name || "").toLowerCase();

    // 1. Plain text files
    if (name.endsWith('.txt') || file.type === 'text/plain') {
      return await file.text();
    }

    // 2. PDF extraction
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      return await this.extractFromPdf(file);
    }

    // 3. Fallback: attempt to read as text and filter printable ASCII
    const raw = await file.text();
    return cleanPdfText(raw);
  },

  // Extract text from PDF using stream scanning, decompression, and operator parsing
  async extractFromPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Convert to latin1 binary string for stream searching
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    const textPieces = [];

    // Find all 'stream ... endstream' blocks
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;

    while ((match = streamRegex.exec(binary)) !== null) {
      const rawStream = match[1];
      const streamBytes = new Uint8Array(rawStream.length);
      for (let j = 0; j < rawStream.length; j++) {
        streamBytes[j] = rawStream.charCodeAt(j);
      }

      // Decompress with fallback across deflate and deflate-raw
      const decompressedBytes = await safeDecompress(streamBytes);
      let decoded = "";
      for (let k = 0; k < decompressedBytes.length; k += chunkSize) {
        decoded += String.fromCharCode.apply(null, decompressedBytes.subarray(k, k + chunkSize));
      }

      // Extract text within BT ... ET operators
      const btRegex = /BT[\s\S]*?ET/g;
      let btMatch;
      while ((btMatch = btRegex.exec(decoded)) !== null) {
        const block = btMatch[0];

        // 1. Literal strings: (text) Tj, (text) ', (text) "
        const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
        let tjMatch;
        while ((tjMatch = tjRegex.exec(block)) !== null) {
          if (tjMatch[1]) textPieces.push(tjMatch[1]);
        }

        // 2. Hex strings: <48656c6c6f> Tj
        const hexTjRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g;
        let hexTjMatch;
        while ((hexTjMatch = hexTjRegex.exec(block)) !== null) {
          const decodedHex = decodePdfHexString(hexTjMatch[1]);
          if (decodedHex) textPieces.push(decodedHex);
        }

        // 3. Array of strings: [(part1) 12 <48656c6c6f> (part2)] TJ
        const arrayRegex = /\[(.*?)\]\s*TJ/g;
        let arrayMatch;
        while ((arrayMatch = arrayRegex.exec(block)) !== null) {
          const content = arrayMatch[1];
          const parts = content.match(/\(([^)]+)\)|<([0-9a-fA-F]+)>/g) || [];
          for (const p of parts) {
            if (p.startsWith('(')) {
              textPieces.push(p.slice(1, -1));
            } else if (p.startsWith('<')) {
              const decodedHex = decodePdfHexString(p.slice(1, -1));
              if (decodedHex) textPieces.push(decodedHex);
            }
          }
        }
      }
    }

    // Fallback 1: direct literal strings with Tj outside standard BT/ET
    if (textPieces.length === 0) {
      const directTj = /\(([^)]{2,})\)\s*(?:Tj|'|")/g;
      let m;
      while ((m = directTj.exec(binary)) !== null) {
        textPieces.push(m[1]);
      }
    }

    // Fallback 2: search for runs of printable ASCII characters in binary
    if (textPieces.length === 0) {
      const matches = binary.match(/[\x20-\x7E\s]{5,}/g) || [];
      const filtered = matches.filter(s => 
        !s.startsWith('/Root') && !s.startsWith('/Info') && !s.startsWith('/Catalog') &&
        !s.includes('endobj') && !s.includes('xref') && !s.includes('stream') &&
        !s.startsWith('<<') && !s.endsWith('>>')
      );
      if (filtered.length > 0) {
        textPieces.push(filtered.join(' '));
      }
    }

    return cleanPdfText(textPieces.join(' '));
  }
};

// Export for browser and node environments
if (typeof window !== 'undefined') {
  window.PdfExtractor = PdfExtractor;
}
if (typeof self !== 'undefined') {
  self.PdfExtractor = PdfExtractor;
}
if (typeof module !== 'undefined') {
  module.exports = { PdfExtractor, safeDecompress, decodePdfHexString };
}

