// File: api/health.js
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Pakasir Payment Gateway',
        version: '1.0.0'
    });
};
