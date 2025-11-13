import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_UsuariosInstalaciones_Usuarios", ["idUsuario"], {})
@Index("FK_UsuariosInstalaciones_Instalaciones", ["idInstalacion"], {})
@Entity("UsuariosInstalaciones")
export class UsuariosInstalaciones {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

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

  @Column("bigint", { name: "IdUsuario" })
  idUsuario: number;

  @Column("bigint", { name: "IdInstalacion" })
  idInstalacion: number;

}
