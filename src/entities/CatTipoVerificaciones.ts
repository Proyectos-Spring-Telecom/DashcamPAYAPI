import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Verificaciones } from './Verificaciones';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Entity('CatTipoVerificaciones')
export class CatTipoVerificaciones {
  @PrimaryGeneratedColumn({ type: 'int', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', nullable: true, length: 100 })
  nombre: string | null;

  @OneToMany(
    () => Verificaciones,
    (verificaciones) => verificaciones.tipoVerificacion,
  )
  verificaciones: Verificaciones[];
}
