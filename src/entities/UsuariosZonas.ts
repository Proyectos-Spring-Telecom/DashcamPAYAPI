import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Zonas } from "./Zonas";
import { Usuarios } from "./Usuarios";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_UsuariosZonas_Usuarios", ["idUsuario"], {})
@Index("FK_UsuariosZonas_Zonas", ["idZona"], {})
@Entity("UsuariosZonas")
export class UsuariosZonas {
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

  @Column("bigint", { name: "IdZona" })
  idZona: number;

  @ManyToOne(() => Zonas, (zonas) => zonas.usuariosZonas, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdZona", referencedColumnName: "id" }])
  idZona2: Zonas;

  @ManyToOne(() => Usuarios, (usuarios) => usuarios.usuariosZonas, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdUsuario", referencedColumnName: "id" }])
  idUsuario2: Usuarios;
}

