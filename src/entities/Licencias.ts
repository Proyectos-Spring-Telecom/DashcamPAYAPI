import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('Licencias', { schema: `${process.env.DB_DATABASE}` })
export class Licencias {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Licencia', length: 500 })
  licencia: string;

  @Column('varchar', { name: 'NumeroLicencia', length: 500 })
  numeroLicencia: string;

  @Column('date', { name: 'FechaExpedicion' })
  fechaExpedicion: string;

  @Column('date', { name: 'FechaVencimiento' })
  fechaVencimiento: string;

  @Column('bigint', { name: 'IdTipoLicencia' })
  idTipoLicencia: number;

  @Column('bigint', { name: 'IdCategoriaLicencia' })
  idCategoriaLicencia: number;

  @Column('bigint', { name: 'IdOperador' })
  idOperador: number;

}
