import {
  isMissingTokenVersionColumn,
  isTokenVersionAccepted,
} from './token-version';

describe('token-version', () => {
  it('acepta tokens sin tv solo si la versión en BD es 0', () => {
    expect(isTokenVersionAccepted(undefined, 0)).toBe(true);
    expect(isTokenVersionAccepted(null, 0)).toBe(true);
    expect(isTokenVersionAccepted(undefined, 1)).toBe(false);
  });

  it('exige que tv coincida con la versión actual', () => {
    expect(isTokenVersionAccepted(0, 0)).toBe(true);
    expect(isTokenVersionAccepted(2, 2)).toBe(true);
    expect(isTokenVersionAccepted(1, 2)).toBe(false);
  });

  it('detecta columna TokenVersion ausente', () => {
    expect(
      isMissingTokenVersionColumn(
        new Error("Unknown column 'TokenVersion' in 'field list'"),
      ),
    ).toBe(true);
    expect(isMissingTokenVersionColumn(new Error('ER_BAD_FIELD_ERROR TokenVersion'))).toBe(
      true,
    );
    expect(isMissingTokenVersionColumn(new Error('connection lost'))).toBe(false);
  });
});
