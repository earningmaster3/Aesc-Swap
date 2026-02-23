import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const ENV = {
    PORT: process.env.PORT || 3000,
    DATABASE_URL: process.env.DATABASE_URL, //local host
    NODE_ENV: process.env.NODE_ENV,//postgres
    FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
}