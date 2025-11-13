import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("UQ_Turnos_IdCliente_Id", ["id", "idCliente"], { unique: true })
@Index("IX_Turnos_IdOperador_Inicio", ["inicio", "idOperador"], {})
@Index("IX_Turnos_IdCliente_Inicio", ["inicio", "idCliente"], {})
@Index("FK_Turnos_Clientes", ["idCliente"], {})
@Index("FK_Turnos_Operadores", ["idOperador"], {})
@Index("FK_Turnos_Instalaciones", ["idInstalacion"], {})
@Entity("Turnos")
export class Turnos {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("datetime", { name: "Inicio" })
  inicio: Date;

  @Column("datetime", { name: "Fin", nullable: true })
  fin: Date | null;

  @Column("datetime", {
    name: "FechaCreacion",
    default: () => "CURRENT_TIMESTAMP",
  })
  fechaCreacion: Date;

  @Column("datetime", {
    name: "FechaActualizacion",
    default: () => "CURRENT_TIMESTAMP",
  })
  fechaActualizacion: Date;

  @Column("tinyint", { name: "Estatus", default: () => "'1'" })
  estatus: number;

  @Column("bigint", { name: "IdCliente" })
  idCliente: number;

  @Column("bigint", { name: "IdOperador" })
  idOperador: number;

  @Column("bigint", { name: "IdInstalacion" })
  idInstalacion: number;

}
