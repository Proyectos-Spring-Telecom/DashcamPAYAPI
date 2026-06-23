import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { applySchema } from 'src/common/apply-schema.decorator';
import { MantenimientoCombustible } from './MantenimientoCombustible';

@applySchema
@Entity('CatTipoCombustible')
export class CatTipoCombustible {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', length: 100 })
  nombre: string;

  @OneToMany(() => MantenimientoCombustible, (mantenimientoCombustible) => mantenimientoCombustible.tipoCombustible)
  mantenimientosCombustible: MantenimientoCombustible[];
}
