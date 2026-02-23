import prisma from './prisma/client.js'

async function db() {
    try {
        await prisma.$connect()
        console.log("✅ Database Connected")
    } catch (error) {
        console.log("❌ Connection Failed", error)
    } finally {
        await prisma.$disconnect()
    }
}

db();