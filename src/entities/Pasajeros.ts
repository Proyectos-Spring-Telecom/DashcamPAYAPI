import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Entity("Pasajeros")
export class Pasajeros {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("varchar", { name: "Nombre", length: 100 })
  nombre: string;

  @Column("varchar", { name: "ApellidoPaterno", length: 100 })
  apellidoPaterno: string;

  @Column("varchar", { name: "ApellidoMaterno", nullable: true, length: 100 })
  apellidoMaterno: string | null;

  @Column("date", { name: "FechaNacimiento" })
  fechaNacimiento: string;

  @Column("varchar", { name: "Telefono", nullable: true, length: 15 })
  telefono: string | null;

  @Column("varchar", { name: "Correo", nullable: true, length: 100 })
  correo: string | null;

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

}
