import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { MantenimientoVehicular } from "./MantenimientoVehicular";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Entity("CatReferenciaServicio")
export class CatReferenciaServicio {
  @PrimaryGeneratedColumn({ type: "int", name: "Id" })
  id: number;

  @Column("varchar", { name: "Nombre", nullable: true, length: 45 })
  nombre: string | null;

  @Column("datetime", {
    name: "FHRegistro",
    nullable: true,
    default: () => "CURRENT_TIMESTAMP",
  })
  fhRegistro: string | null;

  @Column("tinyint", { name: "Estatus", nullable: true, default: () => "'1'" })
  estatus: number | null;

  @OneToMany(() => MantenimientoVehicular, (mantenimientoVehicular) => mantenimientoVehicular.referenciaServicio)
  mantenimientosVehiculares: MantenimientoVehicular[];
}


