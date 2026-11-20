import type { ParsedRow } from './types';

/** Sample parsed rows shared by the bulk-import stories and tests. */
export function makeRow(rowNumber: number, valid = true): ParsedRow {
  const data = {
    name: `Player ${rowNumber}`,
    age: valid ? '19' : 'abc',
    nationality: 'Ghanaian',
    region: 'central-africa',
    position: 'ST',
    bio: '',
  };
  return {
    rowNumber,
    data,
    valid: valid ? { ...data, age: 19 } : null,
    errors: valid
      ? []
      : [
          {
            field: 'age',
            code: 'INVALID_AGE',
            row: rowNumber,
            params: { min: 14, max: 45 },
          },
        ],
    isValid: valid,
  };
}

export const sampleRows: ParsedRow[] = [
  makeRow(1),
  makeRow(2),
  makeRow(3, false),
  makeRow(4),
  makeRow(5),
];
