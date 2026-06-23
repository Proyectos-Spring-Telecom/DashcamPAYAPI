
import {  IsOptional, IsNumber } from 'class-validator';

export class UpdateHistoricoDto {

  @IsOptional()
  @IsNumber()
  idInstalacion?: number;

  @IsOptional()
  @IsNumber()
  idValidador?: number;


  @IsOptional()
  @IsNumber()
  idContador?: number;

  @IsOptional()
  @IsNumber()
  idVehiculo?: number;


  @IsOptional()
  @IsNumber()
  idCliente?: number;

}
