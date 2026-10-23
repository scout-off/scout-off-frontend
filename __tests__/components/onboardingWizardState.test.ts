import {
  INITIAL_WIZARD_DATA,
  formatShortCid,
  isBasicInfoValid,
  isStepId,
  stepReducer,
  validateBasicInfo,
  validateField,
  validateHighlightReel,
} from '@/components/player/onboarding/wizardState';

describe('stepReducer', () => {
  it('advances and goes back within bounds', () => {
    expect(stepReducer(1, { type: 'NEXT' })).toBe(2);
    expect(stepReducer(2, { type: 'NEXT' })).toBe(3);
    expect(stepReducer(3, { type: 'BACK' })).toBe(2);
  });

  it('clamps at the first and last step', () => {
    expect(stepReducer(3, { type: 'NEXT' })).toBe(3);
    expect(stepReducer(1, { type: 'BACK' })).toBe(1);
  });

  it('jumps with GOTO', () => {
    expect(stepReducer(1, { type: 'GOTO', step: 3 })).toBe(3);
  });

  it('recognises valid step ids', () => {
    expect(isStepId(0)).toBe(false);
    expect(isStepId(2)).toBe(true);
    expect(isStepId(4)).toBe(false);
  });
});

describe('validation', () => {
  it('validates single fields', () => {
    expect(validateField('name', ' ')).toBe('Name is required');
    expect(validateField('name', 'A')).toBe('Name must be at least 2 characters');
    expect(validateField('name', 'Ab')).toBeUndefined();
    expect(validateField('age', '')).toBe('Age is required');
    expect(validateField('age', '13')).toBe('Age must be between 14 and 45');
    expect(validateField('age', '20')).toBeUndefined();
    expect(validateField('region', '')).toBe('Region is required');
  });

  it('reports every missing basic-info field', () => {
    expect(Object.keys(validateBasicInfo(INITIAL_WIZARD_DATA)).sort()).toEqual([
      'age',
      'name',
      'nationality',
      'position',
      'region',
    ]);
    expect(
      isBasicInfoValid({
        ...INITIAL_WIZARD_DATA,
        name: 'Ada',
        age: '20',
        nationality: 'Nigerian',
        region: 'west',
        position: 'FW',
      }),
    ).toBe(true);
  });

  it('validates the highlight reel step', () => {
    expect(validateHighlightReel('', true).ipfsHash).toMatch(/wait/);
    expect(validateHighlightReel('', false).ipfsHash).toMatch(/upload/);
    expect(validateHighlightReel('Qm123', false)).toEqual({});
  });

  it('shortens CIDs', () => {
    expect(formatShortCid('')).toBe('');
    expect(formatShortCid('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefgh…voxyz'.replace('voxyz', 'uvwxyz'));
  });
});
