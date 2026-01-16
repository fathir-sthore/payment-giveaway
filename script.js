// Import Toastify jika menggunakan ES modules
import Toastify from 'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify-es.js';

// API Base URL
const API_BASE_URL = window.location.origin;

// State Management
let currentUser = null;
let currentToken = null;
let currentPayment = null;
let qrExpiryTimer = null;

// DOM Elements
const elements = {
    loading: document.getElementById('loading'),
    authScreen: document.getElementById('authScreen'),
    appScreen: document.getElementById('appScreen'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    showRegister: document.getElementById('showRegister'),
    showLogin: document.getElementById('showLogin'),
    logoutBtn: document.getElementById('logoutBtn'),
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content')
};

// Utility Functions
class Utils {
    static formatCurrency(amount) {
        return 'Rp ' + amount.toLocaleString('id-ID');
    }

    static formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    static showToast(message, type = 'info') {
        const backgroundColor = type === 'success' ? '#4caf50' : 
                               type === 'error' ? '#f44336' : 
                               type === 'warning' ? '#ff9800' : '#2196f3';
        
        Toastify({
            text: message,
            duration: 3000,
            gravity: "top",
            position: "right",
            backgroundColor,
            stopOnFocus: true
        }).showToast();
    }

    static showLoading() {
        elements.loading.style.display = 'flex';
    }

    static hideLoading() {
        elements.loading.style.display = 'none';
    }

    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
}

// API Service
class ApiService {
    static async request(endpoint, data = {}, method = 'POST') {
        const url = `${API_BASE_URL}/api${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(currentToken && { 'Authorization': `Bearer ${currentToken}` })
        };

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: method !== 'GET' ? JSON.stringify(data) : undefined
            });

            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Request failed');
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            Utils.showToast(error.message, 'error');
            throw error;
        }
    }

    static async login(email, password) {
        return this.request('/auth', { action: 'login', email, password });
    }

    static async register(userData) {
        return this.request('/auth', { action: 'register', ...userData });
    }

    static async verifyToken(token) {
        return this.request('/auth', { action: 'verify', token });
    }

    static async logout() {
        return this.request('/auth', { action: 'logout' });
    }
}

// Auth Manager
class AuthManager {
    static async init() {
        const token = localStorage.getItem('pakasir_token');
        if (token) {
            try {
                const result = await ApiService.verifyToken(token);
                if (result.success) {
                    this.loginSuccess(result.user, token);
                    return true;
                }
            } catch (error) {
                this.logout();
            }
        }
        return false;
    }

    static async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            Utils.showToast('Please enter email and password', 'error');
            return;
        }

        try {
            Utils.showLoading();
            const result = await ApiService.login(email, password);
            
            if (result.success) {
                this.loginSuccess(result.user, result.token);
                Utils.showToast('Login successful!', 'success');
            }
        } catch (error) {
            // Error already shown by ApiService
        } finally {
            Utils.hideLoading();
        }
    }

    static async handleRegister(event) {
        event.preventDefault();
        
        const formData = {
            name: document.getElementById('registerName').value,
            email: document.getElementById('registerEmail').value,
            phone: document.getElementById('registerPhone').value,
            password: document.getElementById('registerPassword').value,
            confirmPassword: document.getElementById('registerConfirmPassword').value
        };

        // Client-side validation
        if (!Utils.validateEmail(formData.email)) {
            Utils.showToast('Please enter a valid email', 'error');
            return;
        }

        if (formData.password.length < 8) {
            Utils.showToast('Password must be at least 8 characters', 'error');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            Utils.showToast('Passwords do not match', 'error');
            return;
        }

        try {
            Utils.showLoading();
            const result = await ApiService.register(formData);
            
            if (result.success) {
                this.loginSuccess(result.user, result.token);
                Utils.showToast('Registration successful!', 'success');
            }
        } catch (error) {
            // Error already shown by ApiService
        } finally {
            Utils.hideLoading();
        }
    }

    static loginSuccess(user, token) {
        currentUser = user;
        currentToken = token;
        
        localStorage.setItem('pakasir_token', token);
        localStorage.setItem('pakasir_user', JSON.stringify(user));
        
        elements.authScreen.style.display = 'none';
        elements.appScreen.style.display = 'block';
        
        this.updateUI();
        TabManager.switchTab('dashboard');
    }

    static async logout() {
        try {
            await ApiService.logout();
        } catch (error) {
            // Ignore logout errors
        } finally {
            currentUser = null;
            currentToken = null;
            
            localStorage.removeItem('pakasir_token');
            localStorage.removeItem('pakasir_user');
            
            elements.appScreen.style.display = 'none';
            elements.authScreen.style.display = 'block';
            elements.loginForm.style.display = 'block';
            elements.registerForm.style.display = 'none';
            
            // Reset forms
            elements.loginForm.reset();
            elements.registerForm.reset();
            
            Utils.showToast('Logged out successfully', 'info');
        }
    }

    static updateUI() {
        if (!currentUser) return;
        
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userBalance').textContent = Utils.formatCurrency(currentUser.balance);
        
        const userRoleElement = document.getElementById('userRole');
        if (currentUser.role === 'admin') {
            userRoleElement.textContent = 'Admin';
            userRoleElement.className = 'badge badge-warning';
            document.getElementById('adminTab').style.display = 'inline-flex';
            document.getElementById('withdrawTab').style.display = 'inline-flex';
        } else {
            userRoleElement.textContent = 'User';
            userRoleElement.className = 'badge badge-primary';
            document.getElementById('adminTab').style.display = 'none';
            document.getElementById('withdrawTab').style.display = 'none';
        }
    }
}

// Tab Manager
class TabManager {
    static init() {
        elements.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    static switchTab(tabName) {
        // Update active tab
        elements.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update active content
        elements.tabContents.forEach(content => {
            const contentId = content.id.replace('Tab', '');
            content.classList.toggle('active', contentId === tabName);
            content.style.display = contentId === tabName ? 'block' : 'none';
        });

        // Load tab-specific data
        switch(tabName) {
            case 'dashboard':
                DashboardManager.load();
                break;
            case 'deposit':
                PaymentManager.resetForm();
                break;
            case 'withdraw':
                if (currentUser?.role !== 'admin') {
                    Utils.showToast('Withdrawal access is for admin only', 'error');
                    this.switchTab('dashboard');
                    return;
                }
                WithdrawalManager.load();
                break;
            case 'history':
                HistoryManager.load();
                break;
            case 'information':
                InformationManager.load();
                break;
            case 'admin':
                if (currentUser?.role !== 'admin') {
                    Utils.showToast('Admin access denied', 'error');
                    this.switchTab('dashboard');
                    return;
                }
                AdminManager.load();
                break;
        }
    }
}

// Dashboard Manager (Skeleton)
class DashboardManager {
    static async load() {
        // Implement dashboard loading
        document.getElementById('totalBalance').textContent = 
            Utils.formatCurrency(currentUser?.balance || 0);
    }
}

// Payment Manager (Skeleton)
class PaymentManager {
    static resetForm() {
        // Reset payment form
    }
}

// Other managers (WithdrawalManager, HistoryManager, etc.)
// Implement sesuai kebutuhan

// Event Listeners
function setupEventListeners() {
    // Auth forms
    elements.loginForm.addEventListener('submit', (e) => AuthManager.handleLogin(e));
    elements.registerForm.addEventListener('submit', (e) => AuthManager.handleRegister(e));
    
    // Auth switches
    elements.showRegister
