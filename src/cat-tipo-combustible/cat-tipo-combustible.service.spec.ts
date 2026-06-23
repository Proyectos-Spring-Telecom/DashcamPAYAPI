import { Test, TestingModule } from '@nestjs/testing';
import { CatTipoCombustibleService } from './cat-tipo-combustible.service';

describe('CatTipoCombustibleService', () => {
  let service: CatTipoCombustibleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatTipoCombustibleService],
    }).compile();

    service = module.get<CatTipoCombustibleService>(CatTipoCombustibleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
