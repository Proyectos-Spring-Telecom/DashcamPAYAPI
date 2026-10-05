import { spawnSync } from 'child_process';
import * as Joi from 'joi';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = Joi.object({
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow(''),
  DB_DATABASE: Joi.string().required(),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  console.error('Error en variables de entorno (detalle omitido).');
  process.exit(1);
}

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE } = envVars;

const args = [
  'typeorm-model-generator',
  '-h',
  String(DB_HOST),
  '-d',
  String(DB_DATABASE),
  '-u',
  String(DB_USER),
  '-p',
  String(DB_PORT),
  '-e',
  'mysql',
  '-o',
  './src/entities',
  '--noConfig',
];
if (DB_PASSWORD) {
  args.push('-x', String(DB_PASSWORD));
}

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  windowsHide: true,
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
