import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { MantenimientoVehicular } from './MantenimientoVehicular';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Entity('CatEstatusMantenimiento')
export class CatEstatusMantenimiento {
  @PrimaryGeneratedColumn({ type: 'int', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', nullable: true, length: 50 })
  nombre: string | null;

  @OneToMany(
    () => MantenimientoVehicular,
    (mantenimientoVehicular) => mantenimientoVehicular.idEstatusRelacion,
  )
  mantenimientosVehiculares: MantenimientoVehicular[];
}
