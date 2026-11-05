/** TLS hacia MySQL solo si DB_SSL=true. Sin la variable, la conexión sigue igual. */
export function mysqlSslOption(): { ssl?: { rejectUnauthorized: boolean } } {
  if (process.env.DB_SSL !== 'true') return {};
  return {
    ssl: {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    },
  };
}
