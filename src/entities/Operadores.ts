import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Usuarios } from "./Usuarios";
import { Turnos } from "./Turnos";
import { Viajes } from "./Viajes";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("UQ_Operadores_NumeroLicencia", ["numeroLicencia"], { unique: true })
@Index("UQ_Operadores_IdUsuario", ["idUsuario"], { unique: true })
@Entity("Operadores")
export class Operadores {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("varchar", { name: "NumeroLicencia", unique: true, length: 20 })
  numeroLicencia: string;

  @Column("date", { name: "FechaNacimiento" })
  fechaNacimiento: string;

  @Column("varchar", { name: "Identificacion", nullable: true, length: 500 })
  identificacion: string | null;

  @Column("varchar", { name: "Licencia", nullable: true, length: 500 })
  licencia: string | null;

  @Column("varchar", {
    name: "ComprobanteDomicilio",
    nullable: true,
    length: 500,
  })
  comprobanteDomicilio: string | null;

  @Column("varchar", {
    name: "AntecedentesNoPenales",
    nullable: true,
    length: 500,
  })
  antecedentesNoPenales: string | null;

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

  @Column("bigint", { name: "IdUsuario", unique: true })
  idUsuario: number;


}
