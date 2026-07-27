import { Global, Module } from '@nestjs/common';
import { TenantOwnershipGuard } from './tenant/tenant-ownership.guard';

/**
 * Módulo global con utilidades transversales de seguridad.
 *
 * Expone {@link TenantOwnershipGuard} para que cualquier controlador pueda
 * usarlo en `@UseGuards(JwtAuthGuard, TenantOwnershipGuard)` sin importar nada.
 * El guard depende de `Reflector` y `DataSource`, ambos disponibles globalmente.
 */
@Global()
@Module({
  providers: [TenantOwnershipGuard],
  exports: [TenantOwnershipGuard],
})
export class CommonModule {}
