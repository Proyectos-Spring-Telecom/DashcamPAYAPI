import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Hello World!';
  }

  async ready() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }
}
