import haversine from 'haversine-distance';
import { Punto, ResultadoRecorrido } from '../common/ApiResponse';

function interpolar(p1: Punto, p2: Punto, distancia: number): Punto[] {
  const puntos: Punto[] = [];
  const total = haversine(p1, p2);
  const pasos = Math.floor(total / distancia);

  for (let i = 1; i <= pasos; i++) {
    const lat = p1.lat + (p2.lat - p1.lat) * (i * distancia / total);
    const lng = p1.lng + (p2.lng - p1.lng) * (i * distancia / total);
    puntos.push({ lat, lng });
  }

  return puntos;
}

export async function generarRecorridoDetallado(
  recorrido: Punto[],
  distanciaInterpolacion = 100
): Promise<ResultadoRecorrido> {
  if (!recorrido || recorrido.length < 2) {
    throw new Error('El recorrido debe tener al menos dos puntos.');
  }

  let resultado: Punto[] = [recorrido[0]];
  let distanciaTotal = 0;

  for (let i = 0; i < recorrido.length - 1; i++) {
    const p1 = recorrido[i];
    const p2 = recorrido[i + 1];
    const puntos = interpolar(p1, p2, distanciaInterpolacion);

    distanciaTotal += haversine(p1, p2);
    resultado = resultado.concat(puntos);
    resultado.push(p2);
  }

  return {
    recorridoDetallado: resultado,
    distanciaKm: parseFloat((distanciaTotal / 1000).toFixed(2)),
  };
}
