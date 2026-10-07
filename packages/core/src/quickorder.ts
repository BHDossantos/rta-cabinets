/**
 * Quick order by SKU (competitive research: Lily Ann Quick Order, Conestoga
 * reorder). Parses pasted text, including rows copied from a spreadsheet.
 * Accepted per line: "B36 2", "B36,2", "B36<TAB>2", "2 x B36", "2x B36", "B36 x2", "B36".
 */
export interface QuickOrderLine {
  skuCode: string;
  quantity: number;
  lines: number[];
}

export interface QuickOrderParse {
  lines: QuickOrderLine[];
  errors: { line: number; text: string; message: string }[];
}

const MAX_QTY = 999;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function parseQuickOrder(text: string): QuickOrderParse {
  const merged = new Map<string, QuickOrderLine>();
  const errors: QuickOrderParse['errors'] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const lineNo = i + 1;
    const t = raw.trim();
    if (!t || t.startsWith('#')) return;
    const parts = t.split(/[\s,;\t]+/).filter(Boolean);
    let code: string | undefined;
    let qtyText: string | undefined;
    const qtyToken = (s: string) => /^x?\d+x?$/i.test(s) && /\d/.test(s);
    if (parts.length === 1) {
      code = parts[0];
      qtyText = '1';
    } else if (parts.length === 2) {
      if (qtyToken(parts[1]!) && !qtyToken(parts[0]!)) [code, qtyText] = [parts[0], parts[1]];
      else if (qtyToken(parts[0]!)) [qtyText, code] = [parts[0], parts[1]];
      else [code, qtyText] = [parts[0], parts[1]];
    } else if (parts.length === 3 && parts[1]!.toLowerCase() === 'x') {
      if (/^\d+$/.test(parts[0]!)) [qtyText, code] = [parts[0], parts[2]];
      else [code, qtyText] = [parts[0], parts[2]];
    } else {
      errors.push({ line: lineNo, text: raw, message: 'Use one SKU and one quantity per line, e.g. "B36 2"' });
      return;
    }
    const qty = Number(String(qtyText).replace(/x/gi, ''));
    if (!code || !CODE.test(code)) {
      errors.push({ line: lineNo, text: raw, message: 'Not a valid SKU code' });
      return;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      errors.push({ line: lineNo, text: raw, message: `Quantity must be a whole number from 1 to ${MAX_QTY}` });
      return;
    }
    const key = code.toUpperCase();
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += qty;
      existing.lines.push(lineNo);
    } else merged.set(key, { skuCode: key, quantity: qty, lines: [lineNo] });
  });
  return { lines: [...merged.values()], errors };
}
