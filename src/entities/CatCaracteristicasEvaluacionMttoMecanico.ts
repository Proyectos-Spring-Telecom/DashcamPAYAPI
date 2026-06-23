import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CatCategoriaMantenimientoMecanico } from "./CatCategoriaMantenimientoMecanico";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_SubCat_CategoriaMantenimientoMecanico", ["idCatCategoriaMantenimientoMecanico"], {})
@Entity("CatCaracteristicasEvaluacionMttoMecanico")
export class CatCaracteristicasEvaluacionMttoMecanico {
  @PrimaryGeneratedColumn({ type: "int", name: "Id" })
  id: number;

  @Column("varchar", { name: "Nombre", length: 250 })
  nombre: string;

  @Column("int", { name: "IdCatCategoriaMantenimientoMecanico" })
  idCatCategoriaMantenimientoMecanico: number;

  @ManyToOne(
    () => CatCategoriaMantenimientoMecanico,
    (categoria) => categoria.caracteristicasEvaluacion,
    {
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
  )
  @JoinColumn([
    {
      name: "IdCatCategoriaMantenimientoMecanico",
      referencedColumnName: "id",
    },
  ])
  categoriaMantenimientoMecanico: CatCategoriaMantenimientoMecanico | null;
}

