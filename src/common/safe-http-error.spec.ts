import { safeClientMessage } from './client-message';

describe('safeClientMessage', () => {
  it('no devuelve SQL en un 400', () => {
    const out = safeClientMessage(
      "QueryFailedError: Unknown column 'Clave' in 'field list'",
      400,
    );
    expect(out).toBe('Solicitud no válida');
    expect(out).not.toContain('Unknown column');
  });

  it('un 500 con texto de red tampoco sale', () => {
    expect(safeClientMessage('connect ECONNREFUSED 127.0.0.1:3306', 500)).toBe(
      'Error interno del servidor',
    );
  });

  it('conserva un mensaje de negocio', () => {
    expect(safeClientMessage('El monedero no fue encontrado.', 404)).toBe(
      'El monedero no fue encontrado.',
    );
  });

  it('une los mensajes de validación', () => {
    expect(safeClientMessage(['monto must be a positive number'], 400)).toBe(
      'monto must be a positive number',
    );
  });
});
