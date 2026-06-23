import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Clientes } from "./Clientes";
import { Validadores } from "./Validadores";
import { Vehiculos } from "./Vehiculos";
import { Turnos } from "./Turnos";
import { UsuariosInstalaciones } from "./UsuariosInstalaciones";
import { Verificaciones } from "./Verificaciones";
import { MantenimientoVehicular } from "./MantenimientoVehicular";
import { MantenimientoKilometraje } from "./MantenimientoKilometraje";
import { MantenimientoCombustible } from "./MantenimientoCombustible";
import { Incidentes } from "./Incidentes";
import { InstalacionContadores } from "./InstalacionContadores";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index(
  "IX_Instalaciones_IdCliente_IdValidador",
  ["idValidador", "idCliente"],
  {}
)
@Index("IX_Instalaciones_IdCliente_IdVehiculo", ["idVehiculo", "idCliente"], {})
@Index("FK_Instalaciones_Clientes", ["idCliente"], {})
@Entity("Instalaciones")
export class Instalaciones {
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

  @Column("bigint", { name: "IdValidador" })
  idValidador: number;

  @Column("bigint", { name: "IdVehiculo" })
  idVehiculo: number;

  @Column("bigint", { name: "IdCliente" })
  idCliente: number;

  @ManyToOne(() => Clientes, (clientes) => clientes.instalaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdCliente", referencedColumnName: "id" }])
  idCliente2: Clientes;

  @ManyToOne(() => Validadores, (validadores) => validadores.instalaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([
    { name: "IdCliente", referencedColumnName: "idCliente" },
    { name: "IdValidador", referencedColumnName: "id" },
  ])
  validadores: Validadores;

  @ManyToOne(() => Vehiculos, (vehiculos) => vehiculos.instalaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([
    { name: "IdCliente", referencedColumnName: "idCliente" },
    { name: "IdVehiculo", referencedColumnName: "id" },
  ])
  vehiculos: Vehiculos;

  @OneToMany(() => Turnos, (turnos) => turnos.idInstalacion2)
  turnos: Turnos[];

  @OneToMany(
    () => UsuariosInstalaciones,
    (usuariosInstalaciones) => usuariosInstalaciones.idInstalacion2
  )
  usuariosInstalaciones: UsuariosInstalaciones[];

  @OneToMany(() => Verificaciones, (verificaciones) => verificaciones.instalacion)
  verificaciones: Verificaciones[];

  @OneToMany(() => MantenimientoVehicular, (mantenimientoVehicular) => mantenimientoVehicular.instalacion)
  mantenimientosVehiculares: MantenimientoVehicular[];

  @OneToMany(() => MantenimientoKilometraje, (mantenimientoKilometraje) => mantenimientoKilometraje.instalacion)
  mantenimientosKilometraje: MantenimientoKilometraje[];

  @OneToMany(() => MantenimientoCombustible, (mantenimientoCombustible) => mantenimientoCombustible.instalacion)
  mantenimientosCombustible: MantenimientoCombustible[];

  @OneToMany(() => Incidentes, (incidentes) => incidentes.instalacion)
  incidentes: Incidentes[];

  @OneToMany(() => InstalacionContadores, (instalacionContadores) => instalacionContadores.instalacion)
  instalacionContadores: InstalacionContadores[];
}
