-- =====================================================================
-- UNIQUE de TransaccionesDebito.ClaveIdempotencia (anti doble cobro)
-- MySQL 8. Ejecutar conectado a la base destino (USE <base>;).
-- Idempotente: si la columna o el índice ya existen, no hace nada.
-- Coincide con la entidad: src/entities/TransaccionesDebito.ts
--   columna ClaveIdempotencia VARCHAR(100) NULL
--   índice  UQ_TransaccionesDebito_ClaveIdempotencia (UNIQUE)
-- Los NULL no chocan entre sí en un UNIQUE de MySQL: los débitos sin clave
-- siguen permitidos.
-- =====================================================================

-- 1) Columna (solo si no existe)
SET @existe_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'TransaccionesDebito'
     AND COLUMN_NAME = 'ClaveIdempotencia'
);
SET @sql := IF(@existe_col = 0,
  'ALTER TABLE TransaccionesDebito ADD COLUMN ClaveIdempotencia VARCHAR(100) NULL',
  'SELECT ''Columna ClaveIdempotencia ya existe'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Revisión de duplicados. Si esta consulta devuelve filas, el paso 3 fallará:
--    revísalas y decide con negocio antes de continuar (no se borra nada aquí).
SELECT ClaveIdempotencia, COUNT(*) AS veces, GROUP_CONCAT(Id ORDER BY Id) AS ids
  FROM TransaccionesDebito
 WHERE ClaveIdempotencia IS NOT NULL
 GROUP BY ClaveIdempotencia
HAVING COUNT(*) > 1;

-- 3) Índice UNIQUE (solo si no existe)
SET @existe_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'TransaccionesDebito'
     AND INDEX_NAME = 'UQ_TransaccionesDebito_ClaveIdempotencia'
);
SET @sql := IF(@existe_idx = 0,
  'CREATE UNIQUE INDEX UQ_TransaccionesDebito_ClaveIdempotencia ON TransaccionesDebito (ClaveIdempotencia) ALGORITHM=INPLACE LOCK=NONE',
  'SELECT ''Índice UQ_TransaccionesDebito_ClaveIdempotencia ya existe'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Verificación: debe devolver una fila con NON_UNIQUE = 0
SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'TransaccionesDebito'
   AND INDEX_NAME = 'UQ_TransaccionesDebito_ClaveIdempotencia';

-- ---------------------------------------------------------------------
-- Reverso (solo si hay que deshacerlo):
-- DROP INDEX UQ_TransaccionesDebito_ClaveIdempotencia ON TransaccionesDebito;
-- ---------------------------------------------------------------------
