import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Instalaciones } from "./Instalaciones";
import { Operadores } from "./Operadores";
import { CatTipoVerificaciones } from "./CatTipoVerificaciones";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_Verificacion_Instalacion_idx", ["idInstalacion"], {})
@Index("FK_Verificaciones_Operador_idx", ["idOperador"], {})
@Entity("Verificaciones")
export class Verificaciones {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("date", { name: "VerificacionActual", nullable: true })
  verificacionActual: string | null;

  @Column("date", { name: "ProximaVerificacion", nullable: true })
  proximaVerificacion: string | null;

  @Column("bigint", { name: "IdInstalacion", nullable: true })
  idInstalacion: number | null;

  @Column("bigint", { name: "IdOperador", nullable: true })
  idOperador: number | null;

  @Column("tinyint", { name: "Estatus", nullable: true })
  estatus: number | null;

  @Column("varchar", { name: "NotaVerificacion", nullable: true, length: 1000 })
  notaVerificacion: string | null;

  @Column("datetime", {
    name: "FHRegistro",
    nullable: true,
    default: () => "CURRENT_TIMESTAMP",
  })
  fhRegistro: string | null;

  @Column("int", { name: "IdTipoVerificacion", nullable: true })
  idTipoVerificacion: number | null;

  @Column("json", { name: "Evaluacion", nullable: true })
  evaluacion: object | null;

  @ManyToOne(() => Instalaciones, (instalaciones) => instalaciones.verificaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdInstalacion", referencedColumnName: "id" }])
  instalacion: Instalaciones | null;

  @ManyToOne(() => Operadores, (operadores) => operadores.verificaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdOperador", referencedColumnName: "id" }])
  operador: Operadores | null;

  @ManyToOne(() => CatTipoVerificaciones, (catTipoVerificaciones) => catTipoVerificaciones.verificaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdTipoVerificacion", referencedColumnName: "id" }])
  tipoVerificacion: CatTipoVerificaciones | null;
}


