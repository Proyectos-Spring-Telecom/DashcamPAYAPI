import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { TransbordosPermitidos } from "./TransbordosPermitidos";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_DetalleTransbordo_Transbordo", ["idTransbordo"], {})
@Entity("DetalleTransbordos")
export class DetalleTransbordos {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("bigint", { name: "IdTransbordo", nullable: true })
  idTransbordo: number | null;

  @Column("decimal", {
    name: "Costo",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  costo: number | null;

  @Column("int", { name: "NroTransbordo", nullable: true })
  nroTransbordo: number | null;

  @ManyToOne(
    () => TransbordosPermitidos,
    (transbordosPermitidos) => transbordosPermitidos.detalleTransbordos,
    {
      onDelete: "NO ACTION",
      onUpdate: "NO ACTION",
    }
  )
  @JoinColumn([{ name: "IdTransbordo", referencedColumnName: "id" }])
  transbordoPermitido: TransbordosPermitidos | null;
}

