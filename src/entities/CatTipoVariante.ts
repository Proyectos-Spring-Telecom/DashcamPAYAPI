import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Variantes } from './Variantes';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Entity('CatTipoVariante')
export class CatTipoVariante {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', length: 100 })
  nombre: string;

  @Column('datetime', {
    name: 'FHRegistro',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fhRegistro: Date;

  @Column('tinyint', { name: 'Estatus', default: () => "'1'" })
  estatus: number;

  @OneToMany(() => Variantes, (variantes) => variantes.tipoVariante)
  variantes: Variantes[];
}
