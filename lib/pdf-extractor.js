// ApplyPilot AI - Zero-Dependency PDF & Text File Extractor
// Extracts structured multi-line text & URI links directly in browser without external packages.
// Handles: Deflate (RFC 1950), Deflate-Raw (RFC 1951), PNG predictors, per-font /ToUnicode CMaps,
// Font/ObjStm resolution, escaped/nested PDF literal strings, TJ kerning, Tm/Td line reconstruction, and /URI links.

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

// PNG predictors (RFC 2083) applied by FlateDecode with /Predictor >= 10.
function undoPngPredictor(data, colors, bitsPerComponent, columns) {
  const bpp = Math.max(1, Math.ceil((colors * bitsPerComponent) / 8));
  const rowLength = Math.ceil((colors * bitsPerComponent * columns) / 8);
  const rowStride = rowLength + 1;
  if (rowStride <= 1 || data.length < rowStride) return data;

  const rows = Math.floor(data.length / rowStride);
  const out = new Uint8Array(rows * rowLength);
  let prevRow = new Uint8Array(rowLength);

  for (let r = 0; r < rows; r++) {
    const filter = data[r * rowStride];
    const src = data.subarray(r * rowStride + 1, r * rowStride + 1 + rowLength);
    const row = new Uint8Array(rowLength);

    for (let i = 0; i < rowLength; i++) {
      const raw = src[i] || 0;
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prevRow[i];
      const upLeft = i >= bpp ? prevRow[i - bpp] : 0;

      let value;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = raw + ((pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft));
          break;
        }
        default: value = raw; break;
      }
      row[i] = value & 0xff;
    }

    out.set(row, r * rowLength);
    prevRow = row;
  }

  return out;
}

function applyDecodeParms(bytes, dict) {
  if (!dict) return bytes;
  const predictorMatch = dict.match(/\/Predictor\s+(\d+)/);
  if (!predictorMatch) return bytes;

  const predictor = parseInt(predictorMatch[1], 10);
  if (!(predictor >= 10)) return bytes;

  const colors = parseInt((dict.match(/\/Colors\s+(\d+)/) || [, '1'])[1], 10);
  const bpc = parseInt((dict.match(/\/BitsPerComponent\s+(\d+)/) || [, '8'])[1], 10);
  const columns = parseInt((dict.match(/\/Columns\s+(\d+)/) || [, '1'])[1], 10);

  try {
    return undoPngPredictor(bytes, colors, bpc, columns);
  } catch (e) {
    return bytes;
  }
}

function normalizeLigatures(str) {
  if (!str) return '';
  return str
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\u00A0/g, ' ');
}

// Build a CID -> Unicode map from a /ToUnicode CMap (bfchar, bfrange scalar & bfrange arrays)
function parseToUnicodeCMap(cmapText) {
  const map = new Map();
  if (!cmapText) return map;

  const hexToStr = (hex) => {
    const clean = hex.replace(/\s+/g, '');
    let out = '';
    if (clean.length === 2) {
      const code = parseInt(clean, 16);
      if (!isNaN(code) && code > 0) out += String.fromCharCode(code);
      return normalizeLigatures(out);
    }
    for (let i = 0; i + 3 < clean.length + 1; i += 4) {
      const code = parseInt(clean.substring(i, i + 4), 16);
      if (!isNaN(code) && code > 0) out += String.fromCharCode(code);
    }
    return normalizeLigatures(out);
  };

  // bfchar: <src> <dst>
  const charSections = cmapText.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const section of charSections) {
    const pairRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let m;
    while ((m = pairRe.exec(section)) !== null) {
      const decoded = hexToStr(m[2]);
      if (decoded) map.set(parseInt(m[1], 16), decoded);
    }
  }

  // bfrange array form: <lo> <hi> [<u1> <u2> ...]
  const rangeSections = cmapText.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const section of rangeSections) {
    const arrayRangeRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g;
    let am;
    while ((am = arrayRangeRe.exec(section)) !== null) {
      const lo = parseInt(am[1], 16);
      const hi = parseInt(am[2], 16);
      if (hi - lo > 65535) continue;
      const targets = am[3].match(/<([0-9a-fA-F]+)>/g) || [];
      for (let idx = 0; idx < targets.length && lo + idx <= hi; idx++) {
        const decoded = hexToStr(targets[idx].slice(1, -1));
        if (decoded) map.set(lo + idx, decoded);
      }
    }

    // bfrange scalar form: <lo> <hi> <dstStart>
    const scalarSection = section.replace(arrayRangeRe, ' ');
    const rangeRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let m;
    while ((m = rangeRe.exec(scalarSection)) !== null) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const dst = parseInt(m[3], 16);
      if (hi - lo > 65535) continue;
      for (let c = lo; c <= hi; c++) {
        map.set(c, normalizeLigatures(String.fromCharCode(dst + (c - lo))));
      }
    }
  }

  return map;
}

function decodePdfHexString(hex) {
  const cleanHex = hex.replace(/\s+/g, '');
  if (cleanHex.length % 2 !== 0) return '';

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
  return normalizeLigatures(str);
}

// Decode a PDF hex string, preferring 2-byte or 1-byte ToUnicode lookup when it explains >= 50% of codes.
function decodeHexWithCMap(hex, cmap) {
  if (!cmap || cmap.size === 0) return decodePdfHexString(hex);

  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) return '';

  // Try 2-byte (4 hex digit) CID decoding first if valid length
  if (clean.length % 4 === 0) {
    let out4 = '';
    let hits4 = 0;
    let total4 = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const code = parseInt(clean.substring(i, i + 4), 16);
      if (isNaN(code)) continue;
      total4++;
      if (cmap.has(code)) {
        out4 += cmap.get(code);
        hits4++;
      }
    }
    if (total4 > 0 && hits4 / total4 >= 0.5) return normalizeLigatures(out4);
  }

  // Fallback to 1-byte (2 hex digit) CMap lookup if keys exist in 0..255
  let out2 = '';
  let hits2 = 0;
  let total2 = 0;
  for (let i = 0; i < clean.length; i += 2) {
    const code = parseInt(clean.substring(i, i + 2), 16);
    if (isNaN(code)) continue;
    total2++;
    if (cmap.has(code)) {
      out2 += cmap.get(code);
      hits2++;
    }
  }
  if (total2 > 0 && hits2 / total2 >= 0.6) return normalizeLigatures(out2);

  return decodePdfHexString(hex);
}

// Decode a raw PDF literal string body (between outer '(' and ')'), preserving escapes, octals, WinAnsi symbols & ligatures.
function decodePdfLiteralBody(rawBody) {
  if (!rawBody) return '';
  let out = '';
  for (let i = 0; i < rawBody.length; i++) {
    const ch = rawBody[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    i++;
    if (i >= rawBody.length) break;
    const esc = rawBody[i];
    if (esc === 'n') out += '\n';
    else if (esc === 'r') out += '\r';
    else if (esc === 't') out += '\t';
    else if (esc === 'b') out += '\b';
    else if (esc === 'f') out += '\f';
    else if (esc === '(' || esc === ')' || esc === '\\') out += esc;
    else if (esc === '\r') {
      if (rawBody[i + 1] === '\n') i++;
    } else if (esc === '\n') {
      // Line continuation inside literal string
    } else if (/[0-7]/.test(esc)) {
      let oct = esc;
      if (i + 1 < rawBody.length && /[0-7]/.test(rawBody[i + 1])) { oct += rawBody[++i]; }
      if (i + 1 < rawBody.length && /[0-7]/.test(rawBody[i + 1])) { oct += rawBody[++i]; }
      const code = parseInt(oct, 8);
      // Translate common WinAnsi printable punctuations before control range stripping
      if (code === 0x95) out += '•';
      else if (code === 0x96) out += '–';
      else if (code === 0x97) out += '—';
      else if (code === 0x91 || code === 0x92) out += "'";
      else if (code === 0x93 || code === 0x94) out += '"';
      else out += String.fromCharCode(code);
    } else {
      out += esc;
    }
  }
  return normalizeLigatures(out);
}

function cleanPdfText(text) {
  if (!text) return '';
  return normalizeLigatures(text)
    .replace(/\\(\d{3})/g, (_, oct) => {
      const code = parseInt(oct, 8);
      if (code === 0x95) return '•';
      if (code === 0x96) return '–';
      if (code === 0x97) return '—';
      return String.fromCharCode(code);
    })
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\r/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Preserves logical line breaks (\n) so downstream DeterministicResumeParser can detect headers, name, and entries
function cleanPdfDocumentText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => cleanPdfText(line))
    .filter(Boolean)
    .join('\n');
}

// Estimate horizontal rendered width in user-space units for spacing heuristics on same-baseline Tm/Td placement
function estimateTextWidth(text, fontSize = 10) {
  if (!text) return 0;
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ' ') w += 0.25;
    else if ('ilIftjr.,:;\'|!1'.includes(c)) w += 0.28;
    else if ('MWm@'.includes(c)) w += 0.72;
    else if (c >= 'A' && c <= 'Z') w += 0.58;
    else w += 0.47;
  }
  return w * (fontSize || 10);
}

// Extract clickable annotation URLs (/URI (...)) from raw binary & decompressed PDF streams
function extractUriLinks(sources = []) {
  const found = new Set();
  const skipHost = /(?:w3\.org|adobe\.com|schemas\.openxmlformats\.org|purl\.org|apple\.com\/DTDs|creativecommons\.org)/i;
  for (const src of sources) {
    if (!src) continue;
    let idx = 0;
    while ((idx = src.indexOf('/URI', idx)) !== -1) {
      idx += 4;
      while (idx < src.length && /\s/.test(src[idx])) idx++;
      if (src[idx] === '(') {
        idx++;
        let depth = 1;
        let raw = '';
        while (idx < src.length && depth > 0) {
          const ch = src[idx++];
          if (ch === '\\' && idx < src.length) {
            raw += ch + src[idx++];
          } else if (ch === '(') {
            depth++;
            raw += ch;
          } else if (ch === ')') {
            depth--;
            if (depth > 0) raw += ch;
          } else {
            raw += ch;
          }
        }
        const decoded = decodePdfLiteralBody(raw).trim();
        if (/^(?:https?:\/\/|mailto:)/i.test(decoded) && !skipHost.test(decoded)) {
          found.add(decoded);
        }
      }
    }
  }
  return Array.from(found);
}

// Parse PDF content stream BT...ET blocks into structured lines preserving kerning & Y-row layout
function extractLinesFromContentStream(decoded, fontMapByName = new Map(), fallbackCMap = new Map()) {
  const lines = [];
  const positionedRuns = [];
  let streamHasAbsoluteTm = false;

  const btRegex = /\bBT\b([\s\S]*?)\bET\b/g;
  let btMatch;

  while ((btMatch = btRegex.exec(decoded)) !== null) {
    const block = btMatch[1];
    let curX = 0;
    let curY = 0;
    let leading = 12;
    let fontSize = 10;
    let activeCMap = fallbackCMap;
    let currentLinePieces = [];
    let currentLineY = 0;
    let currentLineX = 0;

    const flushRelativeLine = () => {
      if (currentLinePieces.length > 0) {
        const joined = currentLinePieces.join(' ').replace(/\s+/g, ' ').trim();
        if (joined) lines.push(joined);
        currentLinePieces = [];
      }
    };

    const emitPositionedPiece = (text, x, y, fSize, hadPositionChange) => {
      if (!text) return;
      if (streamHasAbsoluteTm) {
        // Group fragments positioned sequentially or via Tm on this line
        if (!hadPositionChange && positionedRuns.length > 0 && Math.abs(positionedRuns[positionedRuns.length - 1].y - y) < 1) {
          const prev = positionedRuns[positionedRuns.length - 1];
          prev.text = prev.text.endsWith(' ') || text.startsWith(' ') ? prev.text + text : prev.text + ' ' + text;
          prev.endX = x + estimateTextWidth(text, fSize);
          return;
        }
        const width = estimateTextWidth(text, fSize);
        positionedRuns.push({ x, y, endX: x + width, fontSize: fSize, text });
      } else {
        currentLinePieces.push(text);
      }
      curX += estimateTextWidth(text, fSize);
    };

    // Tokenize operands & operators inside this BT..ET block
    const stack = [];
    let i = 0;
    const n = block.length;
    let hadPositionChange = false;

    while (i < n) {
      const ch = block[i];
      if (/\s/.test(ch)) { i++; continue; }

      // Comment
      if (ch === '%') {
        while (i < n && block[i] !== '\n' && block[i] !== '\r') i++;
        continue;
      }

      // Literal string (...) handling balanced parens & escapes
      if (ch === '(') {
        i++;
        let depth = 1;
        let raw = '';
        while (i < n && depth > 0) {
          const c = block[i++];
          if (c === '\\' && i < n) {
            raw += c + block[i++];
          } else if (c === '(') {
            depth++;
            raw += c;
          } else if (c === ')') {
            depth--;
            if (depth > 0) raw += c;
          } else {
            raw += c;
          }
        }
        stack.push({ type: 'str', value: decodePdfLiteralBody(raw) });
        continue;
      }

      // Array [...]
      if (ch === '[') {
        i++;
        const arr = [];
        while (i < n && block[i] !== ']') {
          const ac = block[i];
          if (/\s/.test(ac)) { i++; continue; }
          if (ac === '(') {
            i++;
            let depth = 1;
            let raw = '';
            while (i < n && depth > 0) {
              const c = block[i++];
              if (c === '\\' && i < n) {
                raw += c + block[i++];
              } else if (c === '(') {
                depth++;
                raw += c;
              } else if (c === ')') {
                depth--;
                if (depth > 0) raw += c;
              } else {
                raw += c;
              }
            }
            arr.push({ type: 'str', value: decodePdfLiteralBody(raw) });
          } else if (ac === '<' && block[i + 1] !== '<') {
            i++;
            let hex = '';
            while (i < n && block[i] !== '>') hex += block[i++];
            if (block[i] === '>') i++;
            arr.push({ type: 'hex', value: hex });
          } else if (/[0-9+\-.]/.test(ac)) {
            let numStr = '';
            while (i < n && /[0-9+\-.]/.test(block[i])) numStr += block[i++];
            const num = parseFloat(numStr);
            if (!isNaN(num)) arr.push({ type: 'num', value: num });
          } else {
            i++;
          }
        }
        if (block[i] === ']') i++;
        stack.push({ type: 'arr', value: arr });
        continue;
      }

      // Hex string <...> (not dictionary <<)
      if (ch === '<') {
        if (block[i + 1] === '<') {
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (block[i] === '<' && block[i + 1] === '<') { depth++; i += 2; }
            else if (block[i] === '>' && block[i + 1] === '>') { depth--; i += 2; }
            else i++;
          }
          continue;
        }
        i++;
        let hex = '';
        while (i < n && block[i] !== '>') hex += block[i++];
        if (block[i] === '>') i++;
        stack.push({ type: 'hex', value: hex });
        continue;
      }

      // Name /FontName
      if (ch === '/') {
        i++;
        let name = '';
        while (i < n && !/[\s()<>\[\]{}\/%]/.test(block[i])) name += block[i++];
        stack.push({ type: 'name', value: name });
        continue;
      }

      // Number
      if (/[0-9+\-.]/.test(ch) && (ch !== '-' && ch !== '+' && ch !== '.' || /[0-9.]/.test(block[i + 1] || ''))) {
        let numStr = '';
        while (i < n && /[0-9+\-.]/.test(block[i])) numStr += block[i++];
        const num = parseFloat(numStr);
        if (!isNaN(num)) stack.push({ type: 'num', value: num });
        continue;
      }

      // Operator word (including ' and ")
      if (ch === "'" || ch === '"') {
        const op = ch;
        i++;
        if (op === '"') {
          const strTok = stack.pop();
          stack.pop(); // ac
          stack.pop(); // aw
          if (!streamHasAbsoluteTm) flushRelativeLine();
          curY -= leading;
          hadPositionChange = true;
          const text = strTok?.type === 'str' ? strTok.value : strTok?.type === 'hex' ? decodeHexWithCMap(strTok.value, activeCMap) : '';
          emitPositionedPiece(text, curX, curY, fontSize, hadPositionChange);
          hadPositionChange = false;
        } else {
          const strTok = stack.pop();
          if (!streamHasAbsoluteTm) flushRelativeLine();
          curY -= leading;
          hadPositionChange = true;
          const text = strTok?.type === 'str' ? strTok.value : strTok?.type === 'hex' ? decodeHexWithCMap(strTok.value, activeCMap) : '';
          emitPositionedPiece(text, curX, curY, fontSize, hadPositionChange);
          hadPositionChange = false;
        }
        continue;
      }

      let op = '';
      while (i < n && !/[\s()<>\[\]{}\/%]/.test(block[i])) op += block[i++];
      if (!op) { i++; continue; }

      if (op === 'Tf') {
        const sz = stack.pop();
        const nm = stack.pop();
        if (sz?.type === 'num' && sz.value > 0) fontSize = sz.value;
        if (nm?.type === 'name' && fontMapByName.has(nm.value)) {
          activeCMap = fontMapByName.get(nm.value);
        }
      } else if (op === 'TL') {
        const tl = stack.pop();
        if (tl?.type === 'num') leading = Math.abs(tl.value) || leading;
      } else if (op === 'Tm') {
        const f = stack.pop()?.value ?? 0;
        const e = stack.pop()?.value ?? 0;
        stack.pop(); stack.pop(); stack.pop(); stack.pop();
        // Promote any previously queued relative items if Tm is encountered
        if (!streamHasAbsoluteTm && currentLinePieces.length > 0) {
          flushRelativeLine();
        }
        streamHasAbsoluteTm = true;
        if (Math.abs(f - curY) > 2) hadPositionChange = true;
        else if (Math.abs(e - curX) > 0.5) hadPositionChange = true;
        curX = e;
        curY = f;
        currentLineY = f;
        currentLineX = e;
      } else if (op === 'Td' || op === 'TD') {
        const ty = stack.pop()?.value ?? 0;
        const tx = stack.pop()?.value ?? 0;
        if (op === 'TD' && ty !== 0) leading = Math.abs(ty);
        if (streamHasAbsoluteTm) {
          currentLineX += tx;
          currentLineY += ty;
          curX = currentLineX;
          curY = currentLineY;
          hadPositionChange = true;
        } else {
          if (Math.abs(ty) > 1.5) {
            flushRelativeLine();
            curY += ty;
          }
          curX += tx;
          hadPositionChange = true;
        }
      } else if (op === 'T*') {
        if (streamHasAbsoluteTm) {
          currentLineY -= leading;
          curX = currentLineX;
          curY = currentLineY;
          hadPositionChange = true;
        } else {
          flushRelativeLine();
          curY -= leading;
        }
      } else if (op === 'Tj') {
        const tok = stack.pop();
        const text = tok?.type === 'str' ? tok.value : tok?.type === 'hex' ? decodeHexWithCMap(tok.value, activeCMap) : '';
        emitPositionedPiece(text, curX, curY, fontSize, hadPositionChange);
        hadPositionChange = false;
      } else if (op === 'TJ') {
        const arrTok = stack.pop();
        if (arrTok?.type === 'arr') {
          let assembled = '';
          let pendingSpaceUnits = 0;
          for (const elem of arrTok.value) {
            if (elem.type === 'num') {
              // In PDF TJ arrays, negative numbers shift text RIGHT (insert horizontal gap)
              pendingSpaceUnits += -elem.value;
            } else {
              const part = elem.type === 'str' ? elem.value : elem.type === 'hex' ? decodeHexWithCMap(elem.value, activeCMap) : '';
              if (!part) continue;
              if (assembled && pendingSpaceUnits >= 140 && !assembled.endsWith(' ') && !part.startsWith(' ')) {
                assembled += ' ';
              }
              assembled += part;
              pendingSpaceUnits = 0;
            }
          }
          emitPositionedPiece(assembled, curX, curY, fontSize, hadPositionChange);
          hadPositionChange = false;
        }
      } else {
        stack.length = 0;
      }
    }

    flushRelativeLine();
  }

  if (streamHasAbsoluteTm && positionedRuns.length > 0) {
    // Reorder positioned runs into top-to-bottom visual lines (2.5pt baseline tolerance), left-to-right within each line
    const sorted = [...positionedRuns].sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2.5) return b.y - a.y;
      return a.x - b.x;
    });

    const rowGroups = [];
    for (const run of sorted) {
      const lastGroup = rowGroups[rowGroups.length - 1];
      if (lastGroup && Math.abs(lastGroup[0].y - run.y) <= 2.5) {
        lastGroup.push(run);
      } else {
        rowGroups.push([run]);
      }
    }

    for (const group of rowGroups) {
      group.sort((a, b) => a.x - b.x);
      let lineStr = '';
      let prevEndX = null;
      let prevFontSize = 10;
      for (const run of group) {
        const piece = run.text;
        if (!piece) continue;
        if (prevEndX !== null && !lineStr.endsWith(' ') && !piece.startsWith(' ')) {
          const gap = run.x - prevEndX;
          const threshold = Math.min(prevFontSize, run.fontSize || 10) * 0.16;
          if (gap > threshold || gap < -Math.max(prevFontSize, 8) * 1.5) {
            lineStr += ' ';
          }
        }
        lineStr += piece;
        prevEndX = run.endX;
        prevFontSize = run.fontSize || prevFontSize;
      }
      const trimmed = lineStr.replace(/\s+/g, ' ').trim();
      if (trimmed) lines.push(trimmed);
    }
  }

  return lines;
}

const PdfExtractor = {
  async extractText(file) {
    if (!file) return "";

    const name = (file.name || "").toLowerCase();

    if (name.endsWith('.txt') || file.type === 'text/plain') {
      return await file.text();
    }

    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      return await this.extractFromPdf(file);
    }

    const raw = await file.text();
    return cleanPdfText(raw);
  },

  async extractFromPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    const bytesToLatin1 = (u8) => {
      let s = "";
      for (let k = 0; k < u8.length; k += chunkSize) {
        s += String.fromCharCode.apply(null, u8.subarray(k, k + chunkSize));
      }
      return s;
    };

    // Pass 1: Scan all object dictionaries & decompress non-image streams once
    const toUnicodeGlobal = new Map();
    const cmapByObj = new Map();
    const fontToUnicodeRef = new Map();
    const fontNameToObjRef = new Map();
    const decompressedTextStreams = [];
    const metadataSources = [binary];

    // Index explicit PDF objects: "12 0 obj ... endobj"
    const objRegex = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;
    let om;
    while ((om = objRegex.exec(binary)) !== null) {
      const objId = om[1];
      const body = om[2];
      const tuRef = body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
      if (tuRef) fontToUnicodeRef.set(objId, tuRef[1]);

      const fontBlock = body.match(/\/Font\s*<<([\s\S]*?)>>/);
      if (fontBlock) {
        const refRe = /\/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R/g;
        let fr;
        while ((fr = refRe.exec(fontBlock[1])) !== null) {
          fontNameToObjRef.set(fr[1], fr[2]);
        }
      }
    }

    // Collect every stream (associating preceding object ID & dictionary when present)
    const streamRegex = /(?:(\d+)\s+\d+\s+obj\s*)?(<<[\s\S]{0,800}?>>)?\s*stream(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)?endstream/g;
    let match;

    while ((match = streamRegex.exec(binary)) !== null) {
      const objId = match[1] || '';
      const dict = match[2] || '';
      const rawStream = match[3];

      // Skip image/ICC binary payloads so we never mistake pixel bytes for text
      if (/\/Subtype\s*\/Image\b/.test(dict)) continue;

      const streamBytes = new Uint8Array(rawStream.length);
      for (let j = 0; j < rawStream.length; j++) {
        streamBytes[j] = rawStream.charCodeAt(j);
      }

      const inflated = await safeDecompress(streamBytes);
      const decompressedBytes = applyDecodeParms(inflated, dict);
      const decoded = bytesToLatin1(decompressedBytes);

      if (/\/Type\s*\/ObjStm\b/.test(dict) || decoded.includes('/URI')) {
        metadataSources.push(decoded);
      }

      // Check /ObjStm font & ToUnicode mappings inside decompressed object streams
      if (/\/Type\s*\/ObjStm\b/.test(dict)) {
        const fontBlock = decoded.match(/\/Font\s*<<([\s\S]*?)>>/);
        if (fontBlock) {
          const refRe = /\/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R/g;
          let fr;
          while ((fr = refRe.exec(fontBlock[1])) !== null) {
            fontNameToObjRef.set(fr[1], fr[2]);
          }
        }
      }

      // Check if this stream is a ToUnicode CMap
      if (decoded.includes('begincmap') || decoded.includes('beginbfchar') || decoded.includes('beginbfrange')) {
        const parsedMap = parseToUnicodeCMap(decoded);
        if (objId && parsedMap.size > 0) cmapByObj.set(objId, parsedMap);
        for (const [code, ch] of parsedMap) {
          if (!toUnicodeGlobal.has(code)) toUnicodeGlobal.set(code, ch);
        }
        continue;
      }

      // Also catch inline /ToUnicode streams preceding endstream without objId capture
      if (/\/ToUnicode\b/.test(dict)) {
        const parsedMap = parseToUnicodeCMap(decoded);
        for (const [code, ch] of parsedMap) {
          if (!toUnicodeGlobal.has(code)) toUnicodeGlobal.set(code, ch);
        }
        continue;
      }

      decompressedTextStreams.push(decoded);
    }

    // Link /FontName -> CMap for per-font CID decoding
    const fontMapByName = new Map();
    for (const [fName, fObjId] of fontNameToObjRef.entries()) {
      const cmapObjId = fontToUnicodeRef.get(fObjId);
      if (cmapObjId && cmapByObj.has(cmapObjId)) {
        fontMapByName.set(fName, cmapByObj.get(cmapObjId));
      }
    }

    // Pass 2: Extract structured lines from every content stream
    const extractedLines = [];
    for (const streamText of decompressedTextStreams) {
      if (/\bBT\b/.test(streamText)) {
        const streamLines = extractLinesFromContentStream(streamText, fontMapByName, toUnicodeGlobal);
        for (const line of streamLines) extractedLines.push(line);
      }
    }

    // Fallback 1: direct literal strings with Tj outside standard BT/ET
    if (extractedLines.length === 0) {
      const directTj = /\(([^)]{2,})\)\s*(?:Tj|'|")/g;
      let m;
      while ((m = directTj.exec(binary)) !== null) {
        extractedLines.push(decodePdfLiteralBody(m[1]));
      }
    }

    // Fallback 2: search for runs of printable ASCII characters in binary
    if (extractedLines.length === 0) {
      const matches = binary.match(/[\x20-\x7E\s]{5,}/g) || [];
      const filtered = matches.filter(s =>
        !s.startsWith('/Root') && !s.startsWith('/Info') && !s.startsWith('/Catalog') &&
        !s.includes('endobj') && !s.includes('xref') && !s.includes('stream') &&
        !s.startsWith('<<') && !s.endsWith('>>')
      );
      if (filtered.length > 0) {
        extractedLines.push(filtered.join(' '));
      }
    }

    // Append clickable PDF /URI hyperlinks when present (e.g. LinkedIn / Portfolio / GitHub badges)
    const uriLinks = extractUriLinks(metadataSources);
    if (uriLinks.length > 0 && extractedLines.length > 0) {
      extractedLines.push(`Links: ${uriLinks.join(' | ')}`);
    }

    return cleanPdfDocumentText(extractedLines.join('\n'));
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
  module.exports = {
    PdfExtractor,
    safeDecompress,
    decodePdfHexString,
    decodeHexWithCMap,
    parseToUnicodeCMap,
    undoPngPredictor,
    applyDecodeParms,
    cleanPdfText,
    cleanPdfDocumentText,
    extractUriLinks
  };
}
