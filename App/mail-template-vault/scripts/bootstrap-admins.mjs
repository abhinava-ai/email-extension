import "./load-env.mjs";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
const temporaryPassword=process.env.ADMIN_TEMP_PASSWORD;
const accounts=[
  ["sandeep@abhinava.ai","Sandeep",temporaryPassword],
  ["ankita@abhinava.ai","Ankita",temporaryPassword],
];
if(!temporaryPassword||temporaryPassword.length<12)throw new Error("Set ADMIN_TEMP_PASSWORD to at least 12 characters.");
const connection=await mysql.createConnection({host:process.env.DB_HOST||"127.0.0.1",port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
try{for(const[email,name,password]of accounts){const hash=await bcrypt.hash(password,12);await connection.execute(`insert into users(id,email,display_name,password_hash,role,must_change_password,active) values (?,?,?,?, 'admin',1,1) on duplicate key update display_name=values(display_name),role='admin',active=1`,[randomUUID(),email,name,hash]);console.log(`Admin ready: ${email}`);}}finally{await connection.end();}
