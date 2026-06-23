import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Pasajeros } from './Pasajeros';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_QRCodes_Pasajeros', ['idPasajero'], {})
@Entity('QRCodes')
export class QRCodes {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdPasajero' })
  idPasajero: number;

  @Column('longtext', { name: 'QRCodeBase64' })
  qrCodeBase64: string;

  @Column('datetime', {
    name: 'FHRegistro',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fhRegistro: Date;

  @Column('tinyint', { name: 'Estatus', default: () => "'1'" })
  estatus: number;

  @Column('datetime', {
    name: 'FechaCreacion',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion: Date;

  @Column('datetime', {
    name: 'FechaActualizacion',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  fechaActualizacion: Date;

  @Column('int', { name: 'NumeroPasajes', nullable: true })
  numeroPasajes: number | null;

  @ManyToOne(() => Pasajeros, (pasajeros) => pasajeros, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdPasajero', referencedColumnName: 'id' }])
  idPasajero2: Pasajeros;
}

