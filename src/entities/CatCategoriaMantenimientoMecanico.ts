import {
  Column,
  Entity,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { CatCaracteristicasEvaluacionMttoMecanico } from "./CatCaracteristicasEvaluacionMttoMecanico";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Entity("CatCategoriaMantenimientoMecanico")
export class CatCategoriaMantenimientoMecanico {
  @PrimaryColumn({ type: "int", name: "Id" })
  id: number;

  @Column("varchar", { name: "Nombre", nullable: true, length: 200 })
  nombre: string | null;

  @OneToMany(
    () => CatCaracteristicasEvaluacionMttoMecanico,
    (caracteristicas) => caracteristicas.categoriaMantenimientoMecanico,
  )
  caracteristicasEvaluacion: CatCaracteristicasEvaluacionMttoMecanico[];
}

