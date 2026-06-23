import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { DireccionesTarjeta } from './DireccionesTarjeta';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Entity('DatosTarjeta')
export class DatosTarjeta {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', nullable: true, length: 100 })
  nombre: string | null;

  @Column('varchar', { name: 'ApellidoPaterno', nullable: true, length: 40 })
  apellidoPaterno: string | null;

  @Column('varchar', { name: 'ApellidoMaterno', nullable: true, length: 40 })
  apellidoMaterno: string | null;

  @Column('varchar', { name: 'Email', nullable: true, length: 100 })
  email: string | null;

  @Column('varchar', { name: 'Telefono', nullable: true, length: 10 })
  telefono: string | null;

  @Column('varchar', { name: 'CustomerIdNetPay', nullable: true, length: 255 })
  customerIdNetPay: string | null;

  @Column('tinyint', { name: 'Estatus', nullable: true, default: () => "'1'" })
  estatus: number | null;

  @OneToMany(
    () => DireccionesTarjeta,
    (direccionesTarjeta) => direccionesTarjeta.idDatosTarjeta2,
  )
  direccionesTarjeta: DireccionesTarjeta[];
}
