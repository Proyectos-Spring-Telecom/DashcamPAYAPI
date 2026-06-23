import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
  } from 'typeorm';
  import { ApiProperty } from '@nestjs/swagger';

  import { applySchema } from 'src/common/apply-schema.decorator';
import { Clientes } from './Clientes';
import { MantenimientoVehicular } from './MantenimientoVehicular';
  
  @Entity('Talleres')
  @applySchema
  export class Talleres {
    @ApiProperty({ example: 1, description: 'Identificador único del taller' })
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;
  
    @ApiProperty({ example: 'Nombre del taller', description: 'Nombre del taller' })
    @Column({ type: 'varchar', length: 100 })
    nombre: string;
  
    @ApiProperty({ example: 'Descripción del taller', required: false })
    @Column({ type: 'varchar', length: 255, nullable: true })
    descripcion?: string;
  
    @ApiProperty({ example: 'url del icono del taller', required: false })
    @Column({ type: 'varchar', length: 255, nullable: true })
    icono?: string;
  
    @ApiProperty({ example: 'Av. Reforma 123, CDMX', required: false })
    @Column({ type: 'varchar', length: 255, nullable: true })
    direccion?: string;
  
    @ApiProperty({ example: 19.432608, required: false })
    @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
    lat?: number;
  
    @ApiProperty({ example: 19.432608,required: false })
    @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
    lng?: number;
  
    @ApiProperty({ example: 1, description: 'Estatus activo (1) o inactivo (0)' })
    @Column({ type: 'tinyint', default: 1 })
    estatus: number;
  
    @ApiProperty({ example: 12, description: 'ID del cliente relacionado', required: false })
    @Column({ type: 'bigint', name: 'IdCliente', nullable: true })
    idCliente?: number;
  
    @ManyToOne(() => Clientes, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'IdCliente' })
    cliente?: Clientes;
  
    @CreateDateColumn({ name: 'FHRegistro', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    fhRegistro: Date;
  
    @UpdateDateColumn({
      name: 'FHActualizacion',
      type: 'datetime',
      default: () => 'CURRENT_TIMESTAMP',
      onUpdate: 'CURRENT_TIMESTAMP',
    })
    fhActualizacion: Date;

    @OneToMany(() => MantenimientoVehicular, (mantenimientoVehicular) => mantenimientoVehicular.taller)
    mantenimientosVehiculares: MantenimientoVehicular[];
  }