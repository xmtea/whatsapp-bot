// WhatsApp Backend - WORKING VERSION
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

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
            
            console.log('👤 Gönderen:', phoneNumber);
            
            try {
              if (interactive) {
                const replyId = interactive.list_reply?.id || interactive.button_reply?.id;
                console.log('🎯 Interactive:', replyId);
                await handleInteractive(phoneNumber, replyId);
              } else if (messageText) {
                console.log('📝 Mesaj:', messageText);
                await handleMessage(phoneNumber, messageText);
              }
            } catch (error) {
              console.error('❌ Hata:', error.message);
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

// MESAJ İŞLEYİCİ
async function handleMessage(phoneNumber, text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('merhaba') || lowerText.includes('selam')) {
    await sendMainMenu(phoneNumber);
  } else {
    await sendMainMenu(phoneNumber);
  }
}

// INTERACTIVE İŞLEYİCİ
async function handleInteractive(phoneNumber, replyId) {
  console.log('🔥 Handler çalıştı, ID:', replyId);
  
  // Restoran listesi
  if (replyId === 'action_new_order' || replyId === 'menu_all') {
    console.log('→ Restoran listesi gönderiliyor');
    await sendRestaurantList(phoneNumber);
    return;
  }
  
  // Kategoriler
  if (replyId === 'business_lezzet' || replyId === 'business_burger' || replyId === 'business_pizza') {
    console.log('→ Kategoriler gönderiliyor');
    await sendCategories(phoneNumber);
    return;
  }
  
  // ÜRÜNLER
  if (replyId === 'cat_kebap' || replyId === 'cat_burger' || replyId === 'cat_drink') {
    console.log('→ ÜRÜNLER GÖNDERİLİYOR!');
    await sendProducts(phoneNumber, replyId);
    return;
  }
  
  // Varsayılan
  console.log('→ Ana menü (default)');
  await sendMainMenu(phoneNumber);
}

// WHATSAPP'A GÖNDER
async function sendToWhatsApp(data) {
  try {
    const response = await axios.post(API_URL, data, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Mesaj gönderildi!');
    return response.data;
  } catch (error) {
    console.error('❌ Gönderim hatası:', error.response?.data || error.message);
    throw error;
  }
}

// ANA MENÜ
async function sendMainMenu(phoneNumber) {
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🍽️ Menüm Yanımda' },
      body: { text: 'Hoş geldiniz! Ne yapmak istersiniz?' },
      footer: { text: 'Lütfen bir işlem seçin' },
      action: {
        button: 'Menü',
        sections: [{
          title: 'Sipariş İşlemleri',
          rows: [
            { id: 'action_new_order', title: '🛒 Sipariş Ver', description: 'Yeni sipariş oluştur' },
            { id: 'action_orders', title: '📦 Siparişlerim', description: 'Geçmiş siparişler' }
          ]
        }, {
          title: 'Restoranlar',
          rows: [
            { id: 'menu_all', title: '📋 Tüm Restoranlar', description: 'Restoran listesi' }
          ]
        }]
      }
    }
  };
  return await sendToWhatsApp(data);
}

// RESTORAN LİSTESİ
async function sendRestaurantList(phoneNumber) {
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🍽️ Restoranlar' },
      body: { text: 'Sipariş vermek istediğiniz restoranı seçin:' },
      action: {
        button: 'Restoran Seç',
        sections: [{
          title: 'Popüler Yerler',
          rows: [
            { id: 'business_lezzet', title: '🍖 Lezzet Durağı', description: 'Kebap & Türk Mutfağı' },
            { id: 'business_burger', title: '🍔 Burger House', description: 'Hamburger & Fast Food' },
            { id: 'business_pizza', title: '🍕 Roma Pizza', description: 'İtalyan Mutfağı' }
          ]
        }]
      }
    }
  };
  return await sendToWhatsApp(data);
}

// KATEGORİLER
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
            { id: 'cat_kebap', title: '🍖 Kebaplar', description: 'Izgara kebap çeşitleri' },
            { id: 'cat_burger', title: '🍔 Hamburgerler', description: 'Burger menü' },
            { id: 'cat_drink', title: '🥤 İçecekler', description: 'Soğuk içecekler' }
          ]
        }]
      }
    }
  };
  return await sendToWhatsApp(data);
}

// ÜRÜNLER
async function sendProducts(phoneNumber, categoryId) {
  console.log('📤 Ürünler gönderiliyor:', categoryId);
  
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
      footer: { text: 'Fiyatlar KDV dahil' },
      action: {
        button: 'Ürünler',
        sections: [{
          title: 'Menü',
          rows: category.items
        }]
      }
    }
  };
  
  return await sendToWhatsApp(data);
}

// ANA SAYFA
app.get('/', (req, res) => {
  res.send('<h1>🚀 WhatsApp Bot Çalışıyor!</h1><p>✅ Interactive Messages Aktif</p>');
});

// SERVER BAŞLAT
app.listen(PORT, () => {
  console.log(`🎉 Server başladı: http://localhost:${PORT}`);
});
