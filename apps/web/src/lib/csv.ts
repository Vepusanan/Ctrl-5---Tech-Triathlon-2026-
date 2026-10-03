/** Saves rows as a CSV file. Every cell is quoted, so commas and quotes in the data are safe. */
export function downloadCsv(
  filename: string,
  header: readonly string[],
  rows: readonly (readonly (string | number)[])[],
) {
  const line = (cells: readonly (string | number)[]) =>
    cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',');
  const url = URL.createObjectURL(
    new Blob([[header, ...rows].map(line).join('\n')], { type: 'text/csv' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
