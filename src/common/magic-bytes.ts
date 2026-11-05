export type AllowedUploadKind = 'png' | 'jpeg' | 'pdf';

const SIGNATURES: Array<{ kind: AllowedUploadKind; bytes: number[] }> = [
  { kind: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { kind: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { kind: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

export function detectAllowedUploadKind(
  buffer?: Buffer | Uint8Array | null,
): AllowedUploadKind | null {
  if (!buffer || buffer.length < 4) return null;
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((byte, i) => buffer[i] === byte)) {
      return sig.kind;
    }
  }
  return null;
}

export function extensionForUploadKind(kind: AllowedUploadKind): string {
  return kind === 'jpeg' ? 'jpg' : kind;
}
