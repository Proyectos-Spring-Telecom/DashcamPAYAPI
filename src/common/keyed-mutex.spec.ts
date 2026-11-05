import { KeyedMutex } from './keyed-mutex';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('KeyedMutex', () => {
  it('serializa la misma clave', async () => {
    const m = new KeyedMutex();
    const orden: string[] = [];
    await Promise.all([
      m.run('a', async () => { orden.push('1-in'); await dormir(20); orden.push('1-out'); }),
      m.run('a', async () => { orden.push('2-in'); orden.push('2-out'); }),
    ]);
    expect(orden).toEqual(['1-in', '1-out', '2-in', '2-out']);
  });

  it('no bloquea claves distintas', async () => {
    const m = new KeyedMutex();
    const orden: string[] = [];
    await Promise.all([
      m.run('a', async () => { await dormir(20); orden.push('a'); }),
      m.run('b', async () => { orden.push('b'); }),
    ]);
    expect(orden).toEqual(['b', 'a']);
  });

  it('libera la clave aunque la función falle', async () => {
    const m = new KeyedMutex();
    await expect(m.run('a', async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(m.run('a', async () => 7)).resolves.toBe(7);
  });
});
