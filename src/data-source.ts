import '@dotenvx/dotenvx/config';
import { DataSource } from 'typeorm';
import { mysqlSslOption } from './common/mysql-ssl';

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/entities/*{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  timezone: 'Z',
  ...mysqlSslOption(),
});
