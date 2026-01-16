// Vercel Serverless Function untuk authentication
const { createHash, randomBytes } = require('crypto');
const jwt = require('jsonwebtoken');

// Simpan di environment variables di Vercel
const JWT_SECRET = process.env.JWT_SECRET || 'pakasir-secret-key-change-in-production';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'fathirsthore@yahoo.com';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 
    createHash('sha256').update('DX#55asDf@fathir').digest('hex');

// Simpan users di memory (untuk production gunakan database)
let users = [];

// Helper functions
function hashPassword(password) {
    return createHash('sha256').update(password).digest('hex');
}

function generateToken(user) {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            role: user.role,
            name: user.name 
        },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action, ...data } = req.body;

    try {
        switch (action) {
            case 'login':
                return handleLogin(req, res, data);
            case 'register':
                return handleRegister(req, res, data);
            case 'verify':
                return handleVerify(req, res, data);
            case 'logout':
                return handleLogout(req, res, data);
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

async function handleLogin(req, res, data) {
    const { email, password } = data;
    
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Check admin user
    if (email === ADMIN_EMAIL) {
        const passwordHash = hashPassword(password);
        if (passwordHash === ADMIN_PASSWORD_HASH) {
            const adminUser = {
                id: 'admin_001',
                email: ADMIN_EMAIL,
                name: 'Admin Fathir',
                phone: '6281234567890',
                role: 'admin',
                balance: 50000000
            };
            
            const token = generateToken(adminUser);
            
            return res.status(200).json({
                success: true,
                user: adminUser,
                token: token
            });
        }
    }

    // Check regular users (gantikan dengan database query)
    const user = users.find(u => u.email === email);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const passwordHash = hashPassword(password);
    if (user.password !== passwordHash) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    
    return res.status(200).json({
        success: true,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            role: user.role,
            balance: user.balance
        },
        token: token
    });
}

async function handleRegister(req, res, data) {
    const { name, email, phone, password, confirmPassword } = data;
    
    // Validation
    if (!name || !email || !phone || !password || !confirmPassword) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    
    if (password !== confirmPassword) {
        return res.status(400).json({ success: false, error: 'Passwords do not match' });
    }
    
    if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    // Check if user exists
    if (users.some(u => u.email === email)) {
        return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    
    // Create new user
    const newUser = {
        id: 'user_' + Date.now() + '_' + randomBytes(4).toString('hex'),
        email: email,
        name: name,
        phone: phone,
        password: hashPassword(password),
        role: 'user',
        balance: 0,
        status: 'active',
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    
    const token = generateToken(newUser);
    
    return res.status(201).json({
        success: true,
        user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            phone: newUser.phone,
            role: newUser.role,
            balance: newUser.balance
        },
        token: token,
        message: 'Registration successful'
    });
}

async function handleVerify(req, res, data) {
    const { token } = data;
    
    if (!token) {
        return res.status(400).json({ success: false, error: 'Token required' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    
    return res.status(200).json({
        success: true,
        user: decoded
    });
}

async function handleLogout(req, res, data) {
    // Untuk JWT, logout dilakukan di client dengan menghapus token
    return res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
          }
