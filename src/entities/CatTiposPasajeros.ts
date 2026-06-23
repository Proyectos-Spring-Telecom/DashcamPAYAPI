import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { applySchema } from 'src/common/apply-schema.decorator';
import { Monederos } from './Monederos';
import { CatTipoDescuento } from './CatTipoDescuento';
@applySchema
@Index('FK_CatPasajeros_Clientes_idx', ['idCliente'], {})
@Entity('CatTiposPasajeros')
export class CatTiposPasajeros {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', length: 50 })
  nombre: string;

  @Column('tinyint', { name: 'IdCatTipoDescuento', nullable: false })
  idCatTipoDescuento: number;

  @Column('int', { name: 'Cantidad', unsigned: true })
  cantidad: number | null;

  @Column('tinyint', { name: 'Estatus', unsigned: true })
  estatus: number;

  @Column('bigint', { name: 'IdCliente' })
  idCliente: number;

  @OneToMany(() => Monederos, (monedero) => monedero.TipoPasajero)
  Monederos: Monederos[];

  @ManyToOne(() => CatTipoDescuento, (descuento) => descuento.TiposPasajeros)
  @JoinColumn({ name: 'IdCatTipoDescuento' })
  CatTipoDescuento: CatTipoDescuento;
}
