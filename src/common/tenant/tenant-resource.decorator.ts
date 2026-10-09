import { SetMetadata } from '@nestjs/common';

/**
 * Clave de metadata usada por {@link TenantOwnershipGuard} para saber qué
 * resolver de pertenencia aplicar a una ruta.
 */
export const TENANT_RESOURCE_KEY = 'tenantResource';

export interface TenantResourceOptions {
  /** Nombre del resolver registrado en `ownershipResolvers`. */
  resolver: string;
  /** Nombre del parámetro de ruta que contiene el id. Por defecto `'id'`. */
  idParam?: string;
}

/**
 * Marca una ruta como perteneciente a un recurso multi-tenant.
 *
 * El {@link TenantOwnershipGuard} usa esta metadata para validar que el
 * recurso identificado por el parámetro de ruta pertenece al tenant del token.
 * Las rutas SIN este decorador NO se ven afectadas por el guard (pasa de largo),
 * por lo que el mecanismo es aditivo y se adopta ruta por ruta.
 *
 * @example
 *   @Get(':id')
 *   @TenantResource('monedero')
 *   findOne(@Param('id') id: number) { ... }
 */
export const TenantResource = (options: TenantResourceOptions | string) =>
  SetMetadata(
    TENANT_RESOURCE_KEY,
    typeof options === 'string' ? { resolver: options } : options,
  );

/** Clave de metadata de {@link TenantExempt}. */
export const TENANT_EXEMPT_KEY = 'tenantExempt';

/**
 * Exime de forma explícita una ruta con parámetro de objeto de la validación
 * por resolver (catálogo global, o pertenencia validada en el servicio).
 * El motivo es obligatorio y queda en el código para revisión.
 * Sin @TenantResource ni @TenantExempt, el guard niega la ruta (fail-closed)
 * y `npm run lint:tenant` falla.
 */
export const TenantExempt = (motivo: string) =>
  SetMetadata(TENANT_EXEMPT_KEY, motivo);
