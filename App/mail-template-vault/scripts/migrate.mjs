import "./load-env.mjs";
import fs from "node:fs/promises";
import mysql from "mysql2/promise";
const sql=await fs.readFile(new URL("../database/schema.sql",import.meta.url),"utf8");
const connection=await mysql.createConnection({host:process.env.DB_HOST||"127.0.0.1",port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,multipleStatements:true});
try{await connection.query(sql);console.log("MySQL schema is ready.");}finally{await connection.end();}
