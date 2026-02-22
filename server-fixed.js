// WhatsApp Backend - Complete Version with Cart, Payment & Admin
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
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

console.log('🚀 WhatsApp Backend başlatılıyor...');

// WEBHOOK VERIFICATION
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

// WEBHOOK MESSAGES
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

// TEXT MESAJ İŞLEYİCİ
async function handleTextMessage(phoneNumber, text) {
  const state = userState.get(phoneNumber);
  
  // Adres bekleniyor
  if (state === 'waiting_address') {
    userState.delete(phoneNumber);
    carts.set(phoneNumber + '_address', text);
    await selectPaymentMethod(phoneNumber);
    return;
  }
  
  // Normal mesajlar
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('merhaba') || lowerText.includes('selam')) {
    await sendMainMenu(phoneNumber);
  } else if (lowerText.includes('sepet')) {
    await sendCartSummary(phoneNumber);
  } else {
    await sendMainMenu(phoneNumber);
  }
}

// INTERACTIVE İŞLEYİCİ
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

// SEPETE EKLE
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

// SEPET ÖZETİ
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

// ADRES SOR
async function askDeliveryAddress(phoneNumber) {
  userState.set(phoneNumber, 'waiting_address');
  await sendText(phoneNumber, '📍 *Teslimat Adresi*\n\nLütfen teslimat adresinizi yazın.\n\nÖrnek: Atatürk Cad. No:123 Daire:5 Beşiktaş/İstanbul');
}

// ÖDEME YÖNTEMİ
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

// SİPARİŞ ONAYLA
async function confirmOrder(phoneNumber, paymentId) {
  const cart = carts.get(phoneNumber) || [];
  const address = carts.get(phoneNumber + '_address') || 'Adres belirtilmedi';
  
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

// SİPARİŞİ TAMAMLA
async function finalizeOrder(phoneNumber) {
  const order = carts.get(phoneNumber + '_pending');
  if (!order) return;
  
  orders.push({ ...order, status: 'Alındı', confirmedAt: new Date().toISOString() });
  
  carts.delete(phoneNumber);
  carts.delete(phoneNumber + '_address');
  carts.delete(phoneNumber + '_pending');
  userState.delete(phoneNumber);
  
  await sendText(phoneNumber, `✅ *Siparişiniz alındı!*\n\n📋 No: ${order.orderNumber}\n⏱️ Tahmini: 30-45 dk\n\nTeşekkür ederiz! 🎉`);
  console.log('✅ Order:', order.orderNumber);
}

// HELPER FUNCTIONS
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

// MENU FUNCTIONS
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

// ADMIN PANEL
app.get('/admin', (req, res) => {
  const ordersHtml = orders.map(order => `
    <div class="order">
      <h3>📋 ${order.orderNumber}</h3>
      <p><strong>Telefon:</strong> ${order.phone}</p>
      <p><strong>Adres:</strong> ${order.address}</p>
      <p><strong>Ödeme:</strong> ${order.payment}</p>
      <p><strong>Toplam:</strong> ${order.total}₺</p>
      <p><strong>Durum:</strong> ${order.status}</p>
      <p><strong>Tarih:</strong> ${new Date(order.timestamp).toLocaleString('tr-TR')}</p>
      <details>
        <summary>Ürünler</summary>
        <ul>
          ${order.cart.map(item => `<li>${item.name} x${item.quantity} = ${item.price * item.quantity}₺</li>`).join('')}
        </ul>
      </details>
    </div>
  `).join('');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Panel - Siparişler</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 30px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-card h3 { color: #666; font-size: 14px; margin-bottom: 10px; }
        .stat-card .number { font-size: 32px; font-weight: bold; color: #4CAF50; }
        .order { background: white; padding: 20px; margin-bottom: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .order h3 { color: #4CAF50; margin-bottom: 15px; }
        .order p { margin: 8px 0; color: #555; }
        details { margin-top: 15px; }
        summary { cursor: pointer; color: #4CAF50; font-weight: bold; }
        ul { margin-top: 10px; padding-left: 20px; }
        li { margin: 5px 0; }
        .no-orders { text-align: center; padding: 40px; color: #999; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📊 Admin Panel - Sipariş Yönetimi</h1>
        
        <div class="stats">
          <div class="stat-card">
            <h3>Toplam Sipariş</h3>
            <div class="number">${orders.length}</div>
          </div>
          <div class="stat-card">
            <h3>Bugünkü Sipariş</h3>
            <div class="number">${orders.filter(o => new Date(o.timestamp).toDateString() === new Date().toDateString()).length}</div>
          </div>
          <div class="stat-card">
            <h3>Toplam Ciro</h3>
            <div class="number">${orders.reduce((sum, o) => sum + o.total, 0)}₺</div>
          </div>
        </div>
        
        ${orders.length > 0 ? ordersHtml : '<div class="no-orders">Henüz sipariş yok</div>'}
      </div>
    </body>
    </html>
  `);
});

app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 WhatsApp Bot Çalışıyor!</h1>
    <p>✅ Sepet Sistemi Aktif</p>
    <p>✅ Ödeme Seçenekleri Aktif</p>
    <p><a href="/admin">📊 Admin Panel</a></p>
  `);
});

app.listen(PORT, () => {
  console.log(`🎉 Server: http://localhost:${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
});
