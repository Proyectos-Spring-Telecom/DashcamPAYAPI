import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { applySchema } from 'src/common/apply-schema.decorator';
import { TransbordosPermitidos } from './TransbordosPermitidos';

@applySchema
@Entity('CatTipoDescuentoTransbordo')
export class CatTipoDescuentoTransbordo {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', length: 100 })
  nombre: string;

  // Relación inversa con TransbordosPermitidos
  @OneToMany(
    () => TransbordosPermitidos,
    (transbordo) => transbordo.tipoDescuento,
  )
  transbordosPermitidos: TransbordosPermitidos[];
}
