// WhatsApp Backend - Complete with Admin API, CORS & Subscription System
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors()); // CORS for admin panel
app.use(express.static('public'));

const PORT = process.env.PORT || 5000;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

// STORAGE
const carts = new Map();
const orders = [];
const userState = new Map();

// RESTAURANT USERS (In production: use database)
const restaurants = [
  {
    id: 'rest_lezzet',
    name: 'Lezzet Durağı',
    email: 'lezzet@example.com',
    password: 'lezzet123',
    businessId: 'business_lezzet',
    subscription: 'premium'
  },
  {
    id: 'rest_burger',
    name: 'Burger House',
    email: 'burger@example.com',
    password: 'burger123',
    businessId: 'business_burger',
    subscription: 'basic'
  },
  {
    id: 'rest_pizza',
    name: 'Roma Pizza',
    email: 'pizza@example.com',
    password: 'pizza123',
    businessId: 'business_pizza',
    subscription: 'premium'
  }
];

// SUPER ADMIN
const SUPER_ADMIN = {
  email: 'admin@menumyanimda.com',
  password: 'Admin2024!',
  role: 'super_admin'
};

console.log('🚀 WhatsApp Backend + Admin API başlatılıyor...');

// ==================== WEBHOOK ====================

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook doğrulandı!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  if (body.object === 'whatsapp_business_account') {
    body.entry?.forEach(entry => {
      entry.changes?.forEach(change => {
        const messages = change.value?.messages;
        
        if (messages) {
          messages.forEach(async (message) => {
            const phoneNumber = message.from;
            const messageText = message.text?.body;
            const interactive = message.interactive;
            
            console.log('👤 From:', phoneNumber);
            
            try {
              if (interactive) {
                const replyId = interactive.list_reply?.id || interactive.button_reply?.id;
                console.log('🎯 Interactive:', replyId);
                await handleInteractive(phoneNumber, replyId);
              } else if (messageText) {
                console.log('📝 Text:', messageText);
                await handleTextMessage(phoneNumber, messageText);
              }
            } catch (error) {
              console.error('❌ Error:', error.message);
            }
          });
        }
      });
    });
    
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// ==================== ADMIN API ====================

// LOGIN API
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  console.log('🔐 Login attempt:', email);
  
  // Super Admin check
  if (email === SUPER_ADMIN.email && password === SUPER_ADMIN.password) {
    return res.json({
      success: true,
      user: {
        id: 'super_admin',
        email: SUPER_ADMIN.email,
        name: 'Super Admin',
        role: 'super_admin',
        subscription: 'premium'
      },
      token: 'super_admin_token_' + Date.now()
    });
  }
  
  // Restaurant user check
  const restaurant = restaurants.find(r => r.email === email && r.password === password);
  
  if (restaurant) {
    return res.json({
      success: true,
      user: {
        id: restaurant.id,
        email: restaurant.email,
        name: restaurant.name,
        role: 'restaurant',
        businessId: restaurant.businessId,
        subscription: restaurant.subscription
      },
      token: 'rest_token_' + restaurant.id + '_' + Date.now()
    });
  }
  
  res.status(401).json({
    success: false,
    message: 'Email veya şifre hatalı'
  });
});

// GET ORDERS
app.get('/api/orders', (req, res) => {
  const { businessId, status } = req.query;
  
  let filteredOrders = [...orders];
  
  // Filter by restaurant
  if (businessId && businessId !== 'all') {
    filteredOrders = filteredOrders.filter(o => o.businessId === businessId);
  }
  
  // Filter by status
  if (status && status !== 'all') {
    filteredOrders = filteredOrders.filter(o => o.status === status);
  }
  
  // Sort by date (newest first)
  filteredOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json({
    success: true,
    orders: filteredOrders,
    total: filteredOrders.length
  });
});

// GET ORDER BY ID
app.get('/api/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const order = orders.find(o => o.orderNumber === orderId);
  
  if (order) {
    res.json({ success: true, order });
  } else {
    res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
  }
});

// UPDATE ORDER STATUS
app.put('/api/orders/:orderId/status', async (req, res) => {
  const { orderId } = req.params;
  const { status, note } = req.body;
  
  const order = orders.find(o => o.orderNumber === orderId);
  
  if (!order) {
    return res.status(404).json({ success: false, message: 'Sipariş bulunamadı' });
  }
  
  const validStatuses = ['Alındı', 'Hazırlanıyor', 'Yolda', 'Teslim Edildi', 'İptal'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Geçersiz durum' });
  }
  
  order.status = status;
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({
    status,
    note,
    timestamp: new Date().toISOString()
  });
  
  console.log(`✅ Sipariş ${orderId} durumu: ${status}`);
  
  // Send WhatsApp notification to customer
  try {
    await sendOrderStatusUpdate(order.phone, order.orderNumber, status);
  } catch (error) {
    console.error('WhatsApp bildirim hatası:', error.message);
  }
  
  res.json({
    success: true,
    message: 'Sipariş durumu güncellendi',
    order
  });
});

// GET STATISTICS
app.get('/api/stats', (req, res) => {
  const { businessId, period } = req.query;
  
  let filteredOrders = [...orders];
  
  if (businessId && businessId !== 'all') {
    filteredOrders = filteredOrders.filter(o => o.businessId === businessId);
  }
  
  // Date filter
  const now = new Date();
  if (period === 'today') {
    filteredOrders = filteredOrders.filter(o => 
      new Date(o.timestamp).toDateString() === now.toDateString()
    );
  } else if (period === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filteredOrders = filteredOrders.filter(o => 
      new Date(o.timestamp) >= weekAgo
    );
  } else if (period === 'month') {
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    filteredOrders = filteredOrders.filter(o => 
      new Date(o.timestamp) >= monthAgo
    );
  }
  
  const stats = {
    totalOrders: filteredOrders.length,
    totalRevenue: filteredOrders.reduce((sum, o) => sum + o.total, 0),
    averageOrder: filteredOrders.length > 0 
      ? filteredOrders.reduce((sum, o) => sum + o.total, 0) / filteredOrders.length 
      : 0,
    statusBreakdown: {
      'Alındı': filteredOrders.filter(o => o.status === 'Alındı').length,
      'Hazırlanıyor': filteredOrders.filter(o => o.status === 'Hazırlanıyor').length,
      'Yolda': filteredOrders.filter(o => o.status === 'Yolda').length,
      'Teslim Edildi': filteredOrders.filter(o => o.status === 'Teslim Edildi').length,
      'İptal': filteredOrders.filter(o => o.status === 'İptal').length
    },
    paymentBreakdown: {
      'Nakit': filteredOrders.filter(o => o.payment.includes('Nakit')).length,
      'Kredi Kartı': filteredOrders.filter(o => o.payment.includes('Kredi')).length,
      'Yemek Kartı': filteredOrders.filter(o => o.payment.includes('Yemek')).length
    }
  };
  
  res.json({ success: true, stats });
});

// GET RESTAURANTS LIST (for super admin)
app.get('/api/restaurants', (req, res) => {
  res.json({
    success: true,
    restaurants: restaurants.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      businessId: r.businessId,
      subscription: r.subscription
    }))
  });
});

// ==================== WHATSAPP FUNCTIONS ====================

async function sendOrderStatusUpdate(phoneNumber, orderNumber, status) {
  const statusMessages = {
    'Alındı': '✅ Siparişiniz alındı',
    'Hazırlanıyor': '👨‍🍳 Siparişiniz hazırlanıyor',
    'Yolda': '🚗 Siparişiniz yolda',
    'Teslim Edildi': '🎉 Siparişiniz teslim edildi',
    'İptal': '❌ Siparişiniz iptal edildi'
  };
  
  const message = `${statusMessages[status]}\n\n📋 Sipariş No: ${orderNumber}`;
  
  await sendText(phoneNumber, message);
}

async function handleTextMessage(phoneNumber, text) {
  const state = userState.get(phoneNumber);
  
  if (state === 'waiting_address') {
    userState.delete(phoneNumber);
    carts.set(phoneNumber + '_address', text);
    await selectPaymentMethod(phoneNumber);
    return;
  }
  
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('merhaba') || lowerText.includes('selam')) {
    await sendMainMenu(phoneNumber);
  } else if (lowerText.includes('sepet')) {
    await sendCartSummary(phoneNumber);
  } else {
    await sendMainMenu(phoneNumber);
  }
}

async function handleInteractive(phoneNumber, replyId) {
  console.log('Handler:', replyId);
  
  if (replyId === 'action_new_order' || replyId === 'menu_all') {
    await sendRestaurantList(phoneNumber);
    return;
  }
  
  if (replyId === 'action_cart') {
    await sendCartSummary(phoneNumber);
    return;
  }
  
  if (replyId === 'business_lezzet' || replyId === 'business_burger' || replyId === 'business_pizza') {
    // Save selected restaurant
    carts.set(phoneNumber + '_restaurant', replyId);
    await sendCategories(phoneNumber);
    return;
  }
  
  if (replyId === 'cat_kebap' || replyId === 'cat_burger' || replyId === 'cat_drink') {
    await sendProducts(phoneNumber, replyId);
    return;
  }
  
  if (replyId.startsWith('prod_')) {
    await addToCart(phoneNumber, replyId);
    return;
  }
  
  if (replyId === 'cart_continue') {
    await sendCategories(phoneNumber);
    return;
  }
  
  if (replyId === 'cart_clear') {
    carts.delete(phoneNumber);
    await sendText(phoneNumber, '🗑️ Sepet temizlendi!');
    await sendMainMenu(phoneNumber);
    return;
  }
  
  if (replyId === 'cart_checkout') {
    await askDeliveryAddress(phoneNumber);
    return;
  }
  
  if (replyId === 'pay_cash' || replyId === 'pay_card' || replyId === 'pay_meal') {
    await confirmOrder(phoneNumber, replyId);
    return;
  }
  
  if (replyId === 'order_confirm') {
    await finalizeOrder(phoneNumber);
    return;
  }
  
  if (replyId === 'order_cancel') {
    await sendText(phoneNumber, '❌ Sipariş iptal edildi.');
    await sendMainMenu(phoneNumber);
    return;
  }
  
  await sendMainMenu(phoneNumber);
}

async function addToCart(phoneNumber, productId) {
  const products = {
    'prod_adana': { name: 'Adana Kebap', price: 150 },
    'prod_urfa': { name: 'Urfa Kebap', price: 150 },
    'prod_beyti': { name: 'Beyti Kebap', price: 180 },
    'prod_classic': { name: 'Klasik Burger', price: 120 },
    'prod_cheese': { name: 'Cheeseburger', price: 140 },
    'prod_double': { name: 'Double Burger', price: 180 },
    'prod_cola': { name: 'Coca Cola', price: 25 },
    'prod_fanta': { name: 'Fanta', price: 25 },
    'prod_ayran': { name: 'Ayran', price: 15 }
  };
  
  const product = products[productId];
  if (!product) return;
  
  if (!carts.has(phoneNumber)) {
    carts.set(phoneNumber, []);
  }
  
  const cart = carts.get(phoneNumber);
  const existing = cart.find(item => item.id === productId);
  
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id: productId, name: product.name, price: product.price, quantity: 1 });
  }
  
  await sendCartSummary(phoneNumber);
}

async function sendCartSummary(phoneNumber) {
  const cart = carts.get(phoneNumber) || [];
  
  if (cart.length === 0) {
    await sendText(phoneNumber, '🛒 Sepetiniz boş!\n\n"Menü" yazarak alışverişe başlayabilirsiniz.');
    return;
  }
  
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartText = cart.map(item => `• ${item.name} x${item.quantity} = ${item.price * item.quantity}₺`).join('\n');
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `🛒 *SEPETİNİZ*\n\n${cartText}\n\n💰 *Toplam: ${total}₺*` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'cart_continue', title: '➕ Alışverişe Devam' } },
          { type: 'reply', reply: { id: 'cart_checkout', title: '✅ Sipariş Ver' } },
          { type: 'reply', reply: { id: 'cart_clear', title: '🗑️ Sepeti Boşalt' } }
        ]
      }
    }
  };
  
  return await sendToWhatsApp(data);
}

async function askDeliveryAddress(phoneNumber) {
  userState.set(phoneNumber, 'waiting_address');
  await sendText(phoneNumber, '📍 *Teslimat Adresi*\n\nLütfen teslimat adresinizi yazın.\n\nÖrnek: Atatürk Cad. No:123 Daire:5 Beşiktaş/İstanbul');
}

async function selectPaymentMethod(phoneNumber) {
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '💳 *Ödeme Yöntemi*\n\nNasıl ödeme yapmak istersiniz?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'pay_cash', title: '💵 Nakit' } },
          { type: 'reply', reply: { id: 'pay_card', title: '💳 Kredi Kartı' } },
          { type: 'reply', reply: { id: 'pay_meal', title: '🎫 Yemek Kartı' } }
        ]
      }
    }
  };
  return await sendToWhatsApp(data);
}

async function confirmOrder(phoneNumber, paymentId) {
  const cart = carts.get(phoneNumber) || [];
  const address = carts.get(phoneNumber + '_address') || 'Adres belirtilmedi';
  const businessId = carts.get(phoneNumber + '_restaurant') || 'business_lezzet';
  
  const payments = { 'pay_cash': '💵 Nakit', 'pay_card': '💳 Kredi Kartı', 'pay_meal': '🎫 Yemek Kartı' };
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const orderNumber = 'SIP-' + Date.now().toString().slice(-6);
  
  const orderText = cart.map(item => `${item.name} x${item.quantity} - ${item.price * item.quantity}₺`).join('\n');
  
  carts.set(phoneNumber + '_pending', {
    orderNumber,
    cart: [...cart],
    total,
    address,
    payment: payments[paymentId],
    phone: phoneNumber,
    businessId,
    timestamp: new Date().toISOString()
  });
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `📦 *SİPARİŞ ÖZETİ*\n\n${orderText}\n\n📍 *Adres:* ${address}\n\n💳 *Ödeme:* ${payments[paymentId]}\n\n💰 *Toplam: ${total}₺*\n📋 No: ${orderNumber}` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'order_confirm', title: '✅ Onayla' } },
          { type: 'reply', reply: { id: 'order_cancel', title: '❌ İptal' } }
        ]
      }
    }
  };
  
  return await sendToWhatsApp(data);
}

async function finalizeOrder(phoneNumber) {
  const order = carts.get(phoneNumber + '_pending');
  if (!order) return;
  
  orders.push({ 
    ...order, 
    status: 'Alındı', 
    confirmedAt: new Date().toISOString(),
    statusHistory: [{
      status: 'Alındı',
      timestamp: new Date().toISOString()
    }]
  });
  
  carts.delete(phoneNumber);
  carts.delete(phoneNumber + '_address');
  carts.delete(phoneNumber + '_restaurant');
  carts.delete(phoneNumber + '_pending');
  userState.delete(phoneNumber);
  
  await sendText(phoneNumber, `✅ *Siparişiniz alındı!*\n\n📋 No: ${order.orderNumber}\n⏱️ Tahmini: 30-45 dk\n\nTeşekkür ederiz! 🎉`);
  console.log('✅ Order:', order.orderNumber, '- Business:', order.businessId);
}

async function sendText(phoneNumber, text) {
  return await sendToWhatsApp({
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'text',
    text: { body: text }
  });
}

async function sendToWhatsApp(data) {
  try {
    const response = await axios.post(API_URL, data, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' }
    });
    console.log('✅ Sent');
    return response.data;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    throw error;
  }
}

async function sendMainMenu(phoneNumber) {
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🍽️ Menüm Yanımda' },
      body: { text: 'Hoş geldiniz!' },
      action: {
        button: 'Menü',
        sections: [{
          title: 'Sipariş',
          rows: [
            { id: 'action_new_order', title: '🛒 Sipariş Ver', description: 'Yeni sipariş' },
            { id: 'action_cart', title: '🛒 Sepetim', description: 'Sepeti görüntüle' }
          ]
        }]
      }
    }
  };
  return await sendToWhatsApp(data);
}

async function sendRestaurantList(phoneNumber) {
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🍽️ Restoranlar' },
      body: { text: 'Restoran seçin:' },
      action: {
        button: 'Restoran Seç',
        sections: [{
          title: 'Popüler',
          rows: [
            { id: 'business_lezzet', title: '🍖 Lezzet Durağı', description: 'Kebap & Türk Mutfağı' },
            { id: 'business_burger', title: '🍔 Burger House', description: 'Fast Food' },
            { id: 'business_pizza', title: '🍕 Roma Pizza', description: 'İtalyan' }
          ]
        }]
      }
    }
  };
  return await sendToWhatsApp(data);
}

async function sendCategories(phoneNumber) {
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '📋 Kategoriler' },
      body: { text: 'Kategori seçin:' },
      action: {
        button: 'Kategoriler',
        sections: [{
          title: 'Menü',
          rows: [
            { id: 'cat_kebap', title: '🍖 Kebaplar', description: 'Izgara kebap' },
            { id: 'cat_burger', title: '🍔 Hamburgerler', description: 'Burger menü' },
            { id: 'cat_drink', title: '🥤 İçecekler', description: 'Soğuk içecek' }
          ]
        }]
      }
    }
  };
  return await sendToWhatsApp(data);
}

async function sendProducts(phoneNumber, categoryId) {
  const products = {
    'cat_kebap': {
      title: '🍖 Kebaplar',
      items: [
        { id: 'prod_adana', title: 'Adana Kebap', description: 'Acılı kıyma - 150₺' },
        { id: 'prod_urfa', title: 'Urfa Kebap', description: 'Acısız kıyma - 150₺' },
        { id: 'prod_beyti', title: 'Beyti Kebap', description: 'Lavash sarma - 180₺' }
      ]
    },
    'cat_burger': {
      title: '🍔 Hamburgerler',
      items: [
        { id: 'prod_classic', title: 'Klasik Burger', description: 'Marul, domates - 120₺' },
        { id: 'prod_cheese', title: 'Cheeseburger', description: 'Cheddar peynirli - 140₺' },
        { id: 'prod_double', title: 'Double Burger', description: 'Çift köfte - 180₺' }
      ]
    },
    'cat_drink': {
      title: '🥤 İçecekler',
      items: [
        { id: 'prod_cola', title: 'Coca Cola', description: '330ml - 25₺' },
        { id: 'prod_fanta', title: 'Fanta', description: '330ml - 25₺' },
        { id: 'prod_ayran', title: 'Ayran', description: '250ml - 15₺' }
      ]
    }
  };
  
  const category = products[categoryId] || products['cat_kebap'];
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: category.title },
      body: { text: 'Ürün seçin:' },
      footer: { text: 'KDV dahil' },
      action: {
        button: 'Ürünler',
        sections: [{ title: 'Menü', rows: category.items }]
      }
    }
  };
  
  return await sendToWhatsApp(data);
}

// ==================== HOME & ADMIN ====================

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp Bot</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
        h1 { color: #4CAF50; }
        .status { background: white; padding: 20px; border-radius: 10px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      </style>
    </head>
    <body>
      <div class="status">
        <h1>🚀 WhatsApp Bot Çalışıyor!</h1>
        <p>✅ Admin API Aktif</p>
        <p>✅ Sepet Sistemi Aktif</p>
        <p>✅ CORS Aktif</p>
        <p>✅ Subscription Sistemi Aktif</p>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🎉 Server başladı: http://localhost:${PORT}`);
  console.log(`📊 Toplam ${restaurants.length} restoran tanımlı`);
  console.log(`✅ CORS aktif - Admin panel hazır!`);
});
