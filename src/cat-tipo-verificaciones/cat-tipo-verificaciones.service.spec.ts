import { Test, TestingModule } from '@nestjs/testing';
import { CatTipoVerificacionesService } from './cat-tipo-verificaciones.service';

describe('CatTipoVerificacionesService', () => {
  let service: CatTipoVerificacionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatTipoVerificacionesService],
    }).compile();

    service = module.get<CatTipoVerificacionesService>(
      CatTipoVerificacionesService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
