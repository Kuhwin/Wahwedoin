export function parseCSVRow(text: string): string[] {
  const row: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(current);
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  row.push(current);
  return row;
}

export function parseCSV(text: string): string[][] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  // Strip UTF-8 BOM so the first header isn't prefixed with \uFEFF
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = "";
      if (ch === "\r" && i + 1 < source.length && source[i + 1] === "\n") i++;
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  return lines.map(parseCSVRow);
}
