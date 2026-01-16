const { MongoClient } = require('mongodb');

// MongoDB connection string (gunakan environment variable di Vercel)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:zP5RdL3rk#66z*z@cluster0.vfprly0.mongodb.net/pakasir?retryWrites=true&w=majority';
const DB_NAME = 'pakasir';

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    try {
        // Escape special characters in password
        const escapedUri = MONGODB_URI.replace(/#/g, '%23');
        
        const client = await MongoClient.connect(escapedUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        const db = client.db(DB_NAME);
        
        // Create indexes
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('transactions').createIndex({ userId: 1, createdAt: -1 });
        await db.collection('transactions').createIndex({ paymentId: 1 }, { unique: true });
        await db.collection('announcements').createIndex({ createdAt: -1 });

        cachedClient = client;
        cachedDb = db;

        console.log('Connected to MongoDB successfully');
        
        return { client, db };
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

// Collections
const COLLECTIONS = {
    USERS: 'users',
    TRANSACTIONS: 'transactions',
    ANNOUNCEMENTS: 'announcements',
    PAYMENT_SESSIONS: 'payment_sessions',
    WITHDRAWALS: 'withdrawals'
};

// Database models
const UserModel = {
    async create(userData) {
        const { db } = await connectToDatabase();
        const result = await db.collection(COLLECTIONS.USERS).insertOne({
            ...userData,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return result.insertedId;
    },

    async findByEmail(email) {
        const { db } = await connectToDatabase();
        return await db.collection(COLLECTIONS.USERS).findOne({ email });
    },

    async findById(id) {
        const { db } = await connectToDatabase();
        return await db.collection(COLLECTIONS.USERS).findOne({ _id: id });
    },

    async updateBalance(userId, amount) {
        const { db } = await connectToDatabase();
        return await db.collection(COLLECTIONS.USERS).updateOne(
            { _id: userId },
            { 
                $inc: { balance: amount },
                $set: { updatedAt: new Date() }
            }
        );
    }
};

const TransactionModel = {
    async create(transactionData) {
        const { db } = await connectToDatabase();
        const result = await db.collection(COLLECTIONS.TRANSACTIONS).insertOne({
            ...transactionData,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return result.insertedId;
    },

    async findByUserId(userId, limit = 50) {
        const { db } = await connectToDatabase();
        return await db.collection(COLLECTIONS.TRANSACTIONS)
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();
    },

    async findByPaymentId(paymentId) {
        const { db } = await connectToDatabase();
        return await db.collection(COLLECTIONS.TRANSACTIONS)
            .findOne({ paymentId });
    },

    async updateStatus(paymentId, status, metadata = {}) {
        const { db } = await connectToDatabase();
        return await db.collection(COLLECTIONS.TRANSACTIONS).updateOne(
            { paymentId },
            { 
                $set: { 
                    status,
                    updatedAt: new Date(),
                    ...metadata
                }
            }
        );
    }
};

module.exports = {
    connectToDatabase,
    UserModel,
    TransactionModel,
    COLLECTIONS
};
