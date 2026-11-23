import { describe, expect, it } from 'vitest';
import { worksheetCell, worksheetKey } from '../src/components/measurementWorksheetLogic';

describe('customer measurement worksheet', () => {
  it('preserves fractions and separates measurements belonging to distinct room features', () => {
    const values = {
      [worksheetKey('Wall 1', 'width')]: '144 3/8',
      [worksheetKey('Window', 'width')]: '33 1/2',
    };
    expect(worksheetCell(values, ['width'], 'Wall 1', 'width')).toBe('144 3/8');
    expect(worksheetCell(values, ['width'], 'Window', 'width')).toBe('33 1/2');
    expect(worksheetCell(values, ['width'], 'Wall 2', 'width')).toBe('');
    expect(worksheetCell(values, ['width'], 'Wall 1', 'height')).toBe('—');
  });
});
