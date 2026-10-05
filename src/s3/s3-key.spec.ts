import {
  buildS3ObjectKey,
  keyFromStoredUrl,
  parseTenantObjectKey,
  S3FolderNotAllowedError,
} from './s3-key';

describe('buildS3ObjectKey', () => {
  it('arma folder/cliente/usuario/uuid.ext', () => {
    expect(
      buildS3ObjectKey(
        'Usuarios',
        12,
        34,
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        'jpg',
      ),
    ).toBe('Usuarios/12/34/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg');
  });

  it('rechaza carpetas fuera de la lista', () => {
    expect(() =>
      buildS3ObjectKey('../etc', 1, 1, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'png'),
    ).toThrow(S3FolderNotAllowedError);
  });

  it('lee el cliente de una key nueva y rechaza una ajena al formato', () => {
    expect(
      parseTenantObjectKey('Usuarios/12/34/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg'),
    ).toEqual({ folder: 'Usuarios', idCliente: 12, idUser: 34 });
    expect(parseTenantObjectKey('logos/archivo.png')).toBeNull();
    expect(parseTenantObjectKey('Usuarios/12/34/../../otro.jpg')).toBeNull();
  });

  it('solo acepta https del bucket indicado', () => {
    const url =
      'https://dashcamsys.s3.us-east-2.amazonaws.com/Usuarios/12/34/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    expect(keyFromStoredUrl(url, 'dashcamsys', 'us-east-2')).toBe(
      'Usuarios/12/34/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg',
    );
    expect(
      keyFromStoredUrl('http://dashcamsys.s3.us-east-2.amazonaws.com/a.png', 'dashcamsys', 'us-east-2'),
    ).toBeNull();
    expect(
      keyFromStoredUrl('https://otro.s3.us-east-2.amazonaws.com/a.png', 'dashcamsys', 'us-east-2'),
    ).toBeNull();
  });

  it('no deja caracteres raros en el uuid ni la extensión', () => {
    expect(
      buildS3ObjectKey('Pasajeros', 7, 9, 'abc..\\def/ghi', 'jpg.exe'),
    ).toBe('Pasajeros/7/9/abcdef.jpgexe');
  });
});
