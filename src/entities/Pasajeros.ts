import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Monederos } from "./Monederos";
import { Usuarios } from "./Usuarios";
import { QRCodes } from "./QRCodes";
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

  @Column("tinyint", { name: "EstadoSolicitud", default: () => "'0'" })
  estadoSolicitud: number;

  @Column("varchar", { name: "Documentacion", nullable: true, length: 500 })
  documentacion: string | null;

  @Column("varchar", { name: "Curp", nullable: true, length: 18 })
  curp: string | null;

  @Column("bigint", { name: "IdUsuario", nullable: true })
  idUsuario: number | null;

  @Column("varchar", { name: "CustomerIdNetPay", nullable: true, length: 255 })
  customerIdNetPay: string | null;

  @OneToMany(() => Monederos, (monederos) => monederos.idPasajero2)
  monederos: Monederos[];

  @OneToMany(() => QRCodes, (qrCodes) => qrCodes.idPasajero2)
  qrCodes: QRCodes[];

  @ManyToOne(() => Usuarios, (usuarios) => usuarios, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdUsuario", referencedColumnName: "id" }])
  idUsuario2: Usuarios | null;
}
