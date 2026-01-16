const { createHash, randomBytes } = require('crypto');
const { UserModel, TransactionModel } = require('./db');

// Real Payment Gateway Configuration
const PAYMENT_GATEWAYS = {
    PAKASIR: {
        baseUrl: process.env.PAKASIR_BASE_URL || 'https://api.pakasir.com/v1',
        apiKey: process.env.PAKASIR_API_KEY || '56j5JPPoiibcmyEQ5FOPsrPj8UnsXxId',
        secretKey: process.env.PAKASIR_SECRET_KEY || 'fathir-sthore'
    },
    XENDIT: {
        baseUrl: 'https://api.xendit.co/v2',
        apiKey: process.env.XENDIT_API_KEY || ''
    }
};

// Helper: Generate unique payment ID
function generatePaymentId(prefix = 'PAK') {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}${timestamp}${random}`;
}

// Helper: Generate signature for payment verification
function generateSignature(data, secretKey) {
    const message = Object.keys(data)
        .sort()
        .map(key => `${key}=${data[key]}`)
        .join('&');
    return createHash('sha256')
        .update(message + secretKey)
        .digest('hex');
}

// Helper: Generate QRIS data
function generateQRISData(paymentData) {
    const { paymentId, amount, merchantName = 'Pakasir Merchant' } = paymentData;
    
    // Format sesuai standard QRIS Indonesia
    const qrisData = {
        "00": "01", // Payload Format Indicator
        "01": "12", // Point of Initiation Method
        "26": {
            "00": "id.co.bankabc",
            "01": `${paymentId}`,
            "02": "PAKASIR"
        },
        "52": "7001", // Merchant Category Code
        "53": "360", // Currency IDR
        "54": amount.toString(),
        "58": "ID", // Country Code
        "59": merchantName.substring(0, 25), // Merchant Name
        "60": "JAKARTA", // Merchant City
        "62": {
            "01": "Payment via Pakasir",
            "05": paymentId
        }
    };
    
    return qrisData;
}

// Main Payment Handler
module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const jwt = require('jsonwebtoken');
    let decoded;
    
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const { action } = req.body;

    try {
        switch (action) {
            case 'create':
                return await createPayment(req, res, decoded);
            case 'status':
                return await checkPaymentStatus(req, res, decoded);
            case 'callback':
                return await handlePaymentCallback(req, res);
            case 'withdraw':
                return await createWithdrawal(req, res, decoded);
            case 'history':
                return await getPaymentHistory(req, res, decoded);
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Payment API error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// Create Payment
async function createPayment(req, res, user) {
    const { amount, paymentMethod = 'qris', note = '', customerEmail, customerName } = req.body;
    
    // Validation
    if (!amount || amount < 1000) {
        return res.status(400).json({ success: false, error: 'Minimum amount is Rp 1,000' });
    }
    
    if (amount > 10000000) {
        return res.status(400).json({ success: false, error: 'Maximum amount is Rp 10,000,000' });
    }
    
    const paymentId = generatePaymentId();
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    // Create payment record in database
    const transactionData = {
        paymentId,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        amount: parseInt(amount),
        paymentMethod,
        note,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: expiryTime,
        metadata: {
            ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        }
    };
    
    try {
        // Save to database
        await TransactionModel.create(transactionData);
        
        // Generate payment response based on method
        let paymentResponse;
        
        switch (paymentMethod.toLowerCase()) {
            case 'qris':
                paymentResponse = await createQRISPayment(paymentId, amount);
                break;
            case 'bank_transfer':
                paymentResponse = await createBankTransferPayment(paymentId, amount);
                break;
            case 'ewallet':
                paymentResponse = await createEWalletPayment(paymentId, amount);
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid payment method' });
        }
        
        return res.status(200).json({
            success: true,
            data: {
                paymentId,
                amount,
                paymentMethod,
                status: 'pending',
                expiresAt: expiryTime.toISOString(),
                ...paymentResponse
            }
        });
        
    } catch (error) {
        console.error('Payment creation error:', error);
        return res.status(500).json({ success: false, error: 'Failed to create payment' });
    }
}

// Create QRIS Payment
async function createQRISPayment(paymentId, amount) {
    // Generate QRIS data
    const qrisData = generateQRISData({ paymentId, amount });
    
    // In production, call real Pakasir API
    // const response = await fetch(`${PAYMENT_GATEWAYS.PAKASIR.baseUrl}/qris/create`, {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': `Bearer ${PAYMENT_GATEWAYS.PAKASIR.apiKey}`
    //     },
    //     body: JSON.stringify({
    //         external_id: paymentId,
    //         amount: amount,
    //         description: 'Payment via Pakasir'
    //     })
    // });
    
    // For demo, return mock response
    return {
        qrString: `00020101021226680014ID.CO.QRIS.WWW0118936009110022222222220303UME51450014ID.CO.QRIS.WWW0215ID12345678901230303UME520454995802ID5920Pakasir Merchant6007JAKARTA6105101406304${paymentId.substr(-4)}`,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`pakasir://payment/${paymentId}/${amount}`)}`,
        paymentUrl: `https://pakasir.com/pay/${paymentId}`,
        instructions: 'Scan QR code dengan aplikasi e-wallet atau mobile banking Anda'
    };
}

// Create Bank Transfer Payment
async function createBankTransferPayment(paymentId, amount) {
    // Virtual account number generation
    const vaNumber = '888' + paymentId.substr(-7).replace(/\D/g, '0').padStart(7, '0');
    
    return {
        bankCode: 'BCA',
        accountNumber: vaNumber,
        accountName: 'PAKASIR MERCHANT',
        instructions: [
            '1. Buka aplikasi mobile banking BCA',
            '2. Pilih Transfer ke BCA Virtual Account',
            '3. Masukkan nomor: ' + vaNumber,
            '4. Jumlah transfer: Rp ' + amount.toLocaleString('id-ID'),
            '5. Konfirmasi transfer'
        ],
        expiryTime: '24 jam'
    };
}

// Create E-Wallet Payment
async function createEWalletPayment(paymentId, amount) {
    return {
        ewalletType: 'DANA',
        phoneNumber: '081234567890',
        instructions: 'Transfer ke nomor DANA 081234567890 a/n PAKASIR',
        amount: amount,
        note: `Payment ID: ${paymentId}`
    };
}

// Check Payment Status
async function checkPaymentStatus(req, res, user) {
    const { paymentId } = req.body;
    
    if (!paymentId) {
        return res.status(400).json({ success: false, error: 'Payment ID required' });
    }
    
    try {
        // Get transaction from database
        const transaction = await TransactionModel.findByPaymentId(paymentId);
        
        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }
        
        // Check if user owns this transaction
        if (transaction.userId !== user.id && user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        
        // Simulate payment status check (in production, call payment gateway API)
        if (transaction.status === 'pending' && new Date() > new Date(transaction.expiresAt)) {
            // Update to expired
            await TransactionModel.updateStatus(paymentId, 'expired');
            transaction.status = 'expired';
        }
        
        // Simulate successful payment (for demo)
        // In production, remove this and call real API
        const shouldSucceed = Math.random() > 0.7 && transaction.status === 'pending';
        
        if (shouldSucceed) {
            // Update transaction status
            await TransactionModel.updateStatus(paymentId, 'success', {
                settledAt: new Date(),
                gatewayResponse: { message: 'Payment successful' }
            });
            
            // Update user balance
            await UserModel.updateBalance(user.id, transaction.amount);
            
            transaction.status = 'success';
        }
        
        return res.status(200).json({
            success: true,
            data: {
                paymentId: transaction.paymentId,
                amount: transaction.amount,
                status: transaction.status,
                createdAt: transaction.createdAt,
                expiresAt: transaction.expiresAt,
                paymentMethod: transaction.paymentMethod
            }
        });
        
    } catch (error) {
        console.error('Status check error:', error);
        return res.status(500).json({ success: false, error: 'Failed to check status' });
    }
}

// Payment Callback Handler (for payment gateway webhook)
async function handlePaymentCallback(req, res) {
    // Verify callback signature
    const signature = req.headers['x-callback-signature'];
    const payload = req.body;
    
    const expectedSignature = generateSignature(payload, PAYMENT_GATEWAYS.PAKASIR.secretKey);
    
    if (signature !== expectedSignature) {
        return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
    
    const { payment_id, status, amount, timestamp } = payload;
    
    try {
        // Find transaction
        const transaction = await TransactionModel.findByPaymentId(payment_id);
        
        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }
        
        // Update transaction status
        await TransactionModel.updateStatus(payment_id, status, {
            settledAt: new Date(timestamp),
            gatewayResponse: payload
        });
        
        // If payment successful, update user balance
        if (status === 'success') {
            await UserModel.updateBalance(transaction.userId, amount);
            
            // Send notification (in production)
            // await sendPaymentSuccessNotification(transaction.userEmail, payment_id, amount);
        }
        
        return res.status(200).json({ success: true, message: 'Callback processed' });
        
    } catch (error) {
        console.error('Callback error:', error);
        return res.status(500).json({ success: false, error: 'Callback processing failed' });
    }
}

// Create Withdrawal
async function createWithdrawal(req, res, user) {
    // Only admin can withdraw
    if (user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    const { amount, method, bankName, accountNumber, accountName, notes } = req.body;
    
    // Validation
    if (!amount || amount < 50000) {
        return res.status(400).json({ success: false, error: 'Minimum withdrawal is Rp 50,000' });
    }
    
    // Check balance
    const userData = await UserModel.findById(user.id);
    if (!userData || userData.balance < amount) {
        return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }
    
    const withdrawalId = generatePaymentId('WD');
    
    try {
        // Create withdrawal record
        const withdrawalData = {
            withdrawalId,
            userId: user.id,
            userName: user.name,
            amount: parseInt(amount),
            method,
            bankName,
            accountNumber,
            accountName,
            notes,
            status: 'pending',
            createdAt: new Date(),
            processedAt: null
        };
        
        // Save to database (you'll need to create WithdrawalModel)
        // await WithdrawalModel.create(withdrawalData);
        
        // Update user balance (deduct)
        await UserModel.updateBalance(user.id, -amount);
        
        // In production: Call withdrawal API (Xendit, etc.)
        // const withdrawalResult = await processWithdrawal(withdrawalData);
        
        return res.status(200).json({
            success: true,
            data: {
                withdrawalId,
                amount,
                method,
                status: 'pending',
                message: 'Withdrawal request submitted. Processing within 1-24 hours.'
            }
        });
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        return res.status(500).json({ success: false, error: 'Withdrawal failed' });
    }
}

// Get Payment History
async function getPaymentHistory(req, res, user) {
    const { limit = 50, type = 'all' } = req.query;
    
    try {
        let query = { userId: user.id };
        
        if (type !== 'all') {
            query.type = type;
        }
        
        // In production, use proper filtering
        const transactions = await TransactionModel.findByUserId(user.id, parseInt(limit));
        
        return res.status(200).json({
            success: true,
            data: transactions.map(tx => ({
                id: tx.paymentId,
                amount: tx.amount,
                type: tx.paymentMethod.includes('withdraw') ? 'withdrawal' : 'deposit',
                method: tx.paymentMethod,
                status: tx.status,
                date: tx.createdAt,
                note: tx.note
            }))
        });
        
    } catch (error) {
        console.error('History error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch history' });
    }
}

// Helper: Process real withdrawal (example with Xendit)
async function processWithdrawal(withdrawalData) {
    // Example using Xendit API
    /*
    const response = await fetch(`${PAYMENT_GATEWAYS.XENDIT.baseUrl}/payouts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(PAYMENT_GATEWAYS.XENDIT.apiKey + ':').toString('base64')}`
        },
        body: JSON.stringify({
            external_id: withdrawalData.withdrawalId,
            amount: withdrawalData.amount,
            bank_code: withdrawalData.bankCode,
            bank_account_name: withdrawalData.accountName,
            bank_account_number: withdrawalData.accountNumber,
            description: withdrawalData.notes || 'Withdrawal from Pakasir'
        })
    });
    
    return await response.json();
    */
    
    // For demo
    return { status: 'PENDING', id: 'demo_withdrawal_' + Date.now() };
}
