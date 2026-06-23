import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CatTipoCombustible } from './CatTipoCombustible';
import { Instalaciones } from './Instalaciones';
import { Operadores } from './Operadores';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_MttoCombustible_TipoCombustible', ['idTipoCombustible'], {})
@Index('FK_MttoCombustible_Instalacion', ['idInstalacion'], {})
@Index('FK_MttoCombustible_Operador', ['idOperador'], {})
@Entity('MantenimientoCombustible')
export class MantenimientoCombustible {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdTipoCombustible', nullable: true })
  idTipoCombustible: number | null;

  @Column('float', { name: 'CantidadCombustible', nullable: true })
  cantidadCombustible: number | null;

  @Column('decimal', {
    name: 'PrecioCombustible',
    nullable: true,
    precision: 10,
    scale: 2,
  })
  precioCombustible: number | null;

  @Column('bigint', { name: 'IdInstalacion', nullable: true })
  idInstalacion: number | null;

  @Column('tinyint', { name: 'Estatus', nullable: true, default: () => "'1'" })
  estatus: number | null;

  @Column('datetime', { name: 'FechaHora', nullable: true })
  fechaHora: string | null;

  @Column('datetime', {
    name: 'FHRegistro',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  fhRegistro: string | null;

  @Column('float', { name: 'Kilometraje', nullable: true })
  kilometraje: number | null;

  @Column('bigint', { name: 'IdOperador', nullable: true })
  idOperador: number | null;

  @ManyToOne(
    () => CatTipoCombustible,
    (catTipoCombustible) => catTipoCombustible.mantenimientosCombustible,
    {
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    },
  )
  @JoinColumn([{ name: 'IdTipoCombustible', referencedColumnName: 'id' }])
  tipoCombustible: CatTipoCombustible | null;

  @ManyToOne(
    () => Instalaciones,
    (instalaciones) => instalaciones.mantenimientosCombustible,
    {
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    },
  )
  @JoinColumn([{ name: 'IdInstalacion', referencedColumnName: 'id' }])
  instalacion: Instalaciones | null;

  @ManyToOne(
    () => Operadores,
    (operadores) => operadores.mantenimientosCombustible,
    {
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    },
  )
  @JoinColumn([{ name: 'IdOperador', referencedColumnName: 'id' }])
  operador: Operadores | null;
}
