import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CatTipoCombustibleService } from './cat-tipo-combustible.service';
import { CatTipoCombustible } from 'src/entities/CatTipoCombustible';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';

describe('CatTipoCombustibleService', () => {
  let service: CatTipoCombustibleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatTipoCombustibleService,
        { provide: getRepositoryToken(CatTipoCombustible), useValue: {} },
        { provide: BitacoraLoggerService, useValue: {} },
      ],
    }).compile();

    service = module.get<CatTipoCombustibleService>(CatTipoCombustibleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
