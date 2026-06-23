import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { applySchema } from 'src/common/apply-schema.decorator';
import { CatTiposPasajeros } from './CatTiposPasajeros';

@applySchema
@Entity('CatTipoDescuento')
export class CatTipoDescuento {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', length: 100 })
  nombre: string;

  // Relación inversa con CatTiposPasajeros
  @OneToMany(
    () => CatTiposPasajeros,
    (tipoPasajero) => tipoPasajero.CatTipoDescuento,
  )
  TiposPasajeros: CatTiposPasajeros[];
}
