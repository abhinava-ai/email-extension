import dotenv from "dotenv";

dotenv.config({
  path: [".env.local", ".env.production", ".env"],
  quiet: true,
});
