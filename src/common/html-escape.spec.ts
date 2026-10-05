import { escapeHtml } from './html-escape';

describe('escapeHtml', () => {
  it('escapa markup', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });
});
