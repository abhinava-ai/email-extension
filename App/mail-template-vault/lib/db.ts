import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";

const globalDb = globalThis as typeof globalThis & { mtvPool?: mysql.Pool };

export const db = globalDb.mtvPool ?? mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  waitForConnections: true,
  enableKeepAlive: true,
  charset: "utf8mb4",
});
if (process.env.NODE_ENV !== "production") globalDb.mtvPool = db;

export async function rows<T extends RowDataPacket[]>(sql: string, values: unknown[] = []) {
  const [result] = await db.execute<T>(sql, values as never[]);
  return result;
}

export async function transaction<T>(work: (connection: PoolConnection) => Promise<T>) {
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); const value = await work(connection); await connection.commit(); return value; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
