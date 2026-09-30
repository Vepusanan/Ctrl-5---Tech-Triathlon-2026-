// Small reader for the challenge CSVs. Cells are not logged.
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text.replace(/^\uFEFF/, ''));
  const header = rows[0];
  if (header === undefined || header.length === 0) {
    throw new Error('CSV has no header');
  }
  const records: Record<string, string>[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim().length === 0)) continue;
    const record: Record<string, string> = {};
    for (const [index, column] of header.entries()) {
      const name = column.trim();
      if (name.length === 0) continue;
      record[name] = (row[index] ?? '').trim();
    }
    records.push(record);
  }
  return records;
}

export function requireCell(row: Record<string, string>, column: string, file: string): string {
  const value = row[column];
  if (value === undefined) {
    throw new Error(`${file} is missing column ${column}`);
  }
  return value;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character ?? '';
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (character !== '\r') {
      cell += character ?? '';
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
