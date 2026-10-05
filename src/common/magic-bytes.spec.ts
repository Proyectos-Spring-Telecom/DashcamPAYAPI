import { detectAllowedUploadKind, extensionForUploadKind } from './magic-bytes';

describe('magic-bytes', () => {
  it('detecta PNG, JPEG y PDF por firma', () => {
    expect(detectAllowedUploadKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(
      'png',
    );
    expect(detectAllowedUploadKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'jpeg',
    );
    expect(detectAllowedUploadKind(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(
      'pdf',
    );
  });

  it('rechaza binarios disfrazados', () => {
    expect(detectAllowedUploadKind(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(detectAllowedUploadKind(Buffer.from([0x00, 0x00]))).toBeNull();
    expect(detectAllowedUploadKind(null)).toBeNull();
  });

  it('mapea extensión canónica', () => {
    expect(extensionForUploadKind('png')).toBe('png');
    expect(extensionForUploadKind('jpeg')).toBe('jpg');
    expect(extensionForUploadKind('pdf')).toBe('pdf');
  });
});
