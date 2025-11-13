import { Entity, PrimaryColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Viajes } from './Viajes';
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
// Definir el índice para el campo "idConteo" según la tabla de la base de datos
@Index('IX_ViajesConteos_Conteo', ['idConteo'])
@Entity('ViajesConteos')
export class ViajesConteos {
  // Clave primaria compuesta (IdViaje, IdConteo)
  @PrimaryColumn('bigint', { name: 'IdViaje' })
  idViaje: number;

  @PrimaryColumn('bigint', { name: 'IdConteo' })
  idConteo: number;




}
