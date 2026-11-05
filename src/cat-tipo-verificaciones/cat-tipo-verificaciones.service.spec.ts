import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CatTipoVerificacionesService } from './cat-tipo-verificaciones.service';
import { CatTipoVerificaciones } from 'src/entities/CatTipoVerificaciones';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';

describe('CatTipoVerificacionesService', () => {
  let service: CatTipoVerificacionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatTipoVerificacionesService,
        { provide: getRepositoryToken(CatTipoVerificaciones), useValue: {} },
        { provide: BitacoraLoggerService, useValue: {} },
      ],
    }).compile();

    service = module.get<CatTipoVerificacionesService>(
      CatTipoVerificacionesService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
