import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { EnumFiltros } from "src/common/estatus.enum";


export class RecorridoMonitoreoDto {
    @ApiProperty({
        description: 'Es el numero de serie del validador',
        example: 'DIS-001A',
        required: true,
    })
    @IsString({message: 'Debe ser formato string'})
    @IsNotEmpty({ message: 'El numero de serie del validador es obligatorio' })
    NumeroSerieValidador: string;

}