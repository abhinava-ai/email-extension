import "./load-env.mjs";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
const email=String(process.env.NEW_USER_EMAIL||"").trim().toLowerCase();
const name=String(process.env.NEW_USER_NAME||"").trim();
const password=String(process.env.NEW_USER_TEMP_PASSWORD||"");
const role=process.env.NEW_USER_ROLE==="admin"?"admin":"member";
if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!name||password.length<12)throw new Error("Set NEW_USER_EMAIL, NEW_USER_NAME, and a unique NEW_USER_TEMP_PASSWORD of at least 12 characters.");
const connection=await mysql.createConnection({host:process.env.DB_HOST||"127.0.0.1",port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
try{await connection.execute("insert into users(id,email,display_name,password_hash,role,must_change_password,active) values (?,?,?,?,?,1,1)",[randomUUID(),email,name,await bcrypt.hash(password,12),role]);console.log(`Created ${role}: ${email}`);}finally{await connection.end();}
