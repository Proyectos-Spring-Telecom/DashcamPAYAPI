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
import { DetalleTransbordos } from "./DetalleTransbordos";
import { CatTipoDescuentoTransbordo } from "./CatTipoDescuentoTransbordo";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_Transbordo_Cliente", ["idCliente"], {})
@Index("FK_Transbordo_TipoDescuento_idx", ["idTipoDescuento"], {})
@Entity("TransbordosPermitidos")
export class TransbordosPermitidos {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("bigint", { name: "IdCliente" })
  idCliente: number;

  @Column("bigint", { name: "IdTipoDescuento", nullable: true })
  idTipoDescuento: number | null;

  @Column("varchar", { name: "Nombre", nullable: true, length: 100 })
  nombre: string | null;

  @Column("float", { name: "Tiempo", nullable: true })
  tiempo: number | null;

  @Column("int", { name: "NumeroTransbordos", nullable: true })
  numeroTransbordos: number | null;

  @Column("tinyint", { name: "Estatus", default: () => "'1'" })
  estatus: number;

  @ManyToOne(() => Clientes, (clientes) => clientes.transbordosPermitidos, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdCliente", referencedColumnName: "id" }])
  idClienteTransbordo: Clientes;

  @ManyToOne(
    () => CatTipoDescuentoTransbordo,
    (tipoDescuento) => tipoDescuento.transbordosPermitidos,
    {
      onDelete: "NO ACTION",
      onUpdate: "NO ACTION",
    }
  )
  @JoinColumn([{ name: "IdTipoDescuento", referencedColumnName: "id" }])
  tipoDescuento: CatTipoDescuentoTransbordo | null;

  @OneToMany(
    () => DetalleTransbordos,
    (detalleTransbordos) => detalleTransbordos.transbordoPermitido
  )
  detalleTransbordos: DetalleTransbordos[];
}

