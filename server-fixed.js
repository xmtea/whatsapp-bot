// WhatsApp Backend - FIXED VERSION
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

console.log('🚀 WhatsApp Backend başlatılıyor (FIXED)...');
console.log('📱 Phone Number ID:', PHONE_NUMBER_ID);
console.log('🔑 Access Token:', ACCESS_TOKEN ? '✅ Mevcut' : '❌ Eksik');

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
  
  console.log('📱 Webhook alındı');
  
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
            console.log('📝 Mesaj:', messageText);
            
            try {
              if (interactive) {
                // Interactive yanıt
                const replyId = interactive.list_reply?.id || interactive.button_reply?.id;
                console.log('🎯 Interactive:', replyId);
                await handleInteractive(phoneNumber, replyId);
              } else if (messageText) {
                // Text mesaj
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
  
  console.log('🤖 İşleniyor:', lowerText);
  
  if (lowerText.includes('merhaba') || lowerText.includes('selam') || lowerText.includes('menu')) {
    await sendMainMenu(phoneNumber);
  } else if (lowerText.includes('sipariş') || lowerText.includes('siparis')) {
    await sendRestaurantList(phoneNumber);
  } else {
    await sendMainMenu(phoneNumber);
  }
}

// INTERACTIVE İŞLEYİCİ
async function handleInteractive(phoneNumber, replyId) {
  if (replyId === 'action_new_order' || replyId === 'menu_all') {
    await sendRestaurantList(phoneNumber);
  } else if (replyId.startsWith('business_')) {
    await sendCategories(phoneNumber);
  } else {
    await sendMainMenu(phoneNumber);
  }
}

// ANA MENÜ GÖNDER
async function sendMainMenu(phoneNumber) {
  console.log('📤 Ana menü gönderiliyor...');
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: '🍽️ Menüm Yanımda'
      },
      body: {
        text: 'Hoş geldiniz! Ne yapmak istersiniz?'
      },
      footer: {
        text: 'Lütfen bir işlem seçin'
      },
      action: {
        button: 'Menü',
        sections: [{
          title: 'Sipariş İşlemleri',
          rows: [
            {
              id: 'action_new_order',
              title: '🛒 Sipariş Ver',
              description: 'Yeni sipariş oluştur'
            },
            {
              id: 'action_orders',
              title: '📦 Siparişlerim',
              description: 'Geçmiş siparişler'
            }
          ]
        }, {
          title: 'Restoranlar',
          rows: [
            {
              id: 'menu_all',
              title: '📋 Tüm Restoranlar',
              description: 'Restoran listesi'
            }
          ]
        }]
      }
    }
  };
  
  return await sendToWhatsApp(data);
}

// RESTORAN LİSTESİ
async function sendRestaurantList(phoneNumber) {
  console.log('📤 Restoran listesi gönderiliyor...');
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: '🍽️ Restoranlar'
      },
      body: {
        text: 'Sipariş vermek istediğiniz restoranı seçin:'
      },
      action: {
        button: 'Restoran Seç',
        sections: [{
          title: 'Popüler Yerler',
          rows: [
            {
              id: 'business_lezzet',
              title: '🍖 Lezzet Durağı',
              description: 'Kebap & Türk Mutfağı'
            },
            {
              id: 'business_burger',
              title: '🍔 Burger House',
              description: 'Hamburger & Fast Food'
            },
            {
              id: 'business_pizza',
              title: '🍕 Roma Pizza',
              description: 'İtalyan Mutfağı'
            }
          ]
        }]
      }
    }
  };
  
  return await sendToWhatsApp(data);
}

// KATEGORİLER
async function sendCategories(phoneNumber) {
  console.log('📤 Kategoriler gönderiliyor...');
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: '📋 Kategoriler'
      },
      body: {
        text: 'Kategori seçin:'
      },
      action: {
        button: 'Kategoriler',
        sections: [{
          title: 'Menü',
          rows: [
            {
              id: 'cat_kebap',
              title: '🍖 Kebaplar',
              description: 'Izgara kebap çeşitleri'
            },
            {
              id: 'cat_burger',
              title: '🍔 Hamburgerler',
              description: 'Burger menü'
            },
            {
              id: 'cat_drink',
              title: '🥤 İçecekler',
              description: 'Soğuk içecekler'
            }
          ]
        }]
      }
    }
  };
  
  return await sendToWhatsApp(data);
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
    
    console.log('✅ Mesaj gönderildi!', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Gönderim hatası:', error.response?.data || error.message);
    throw error;
  }
}

// ANA SAYFA
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 WhatsApp Bot Çalışıyor! (FIXED)</h1>
    <p>✅ Interactive Messages Aktif</p>
    <p>📱 WhatsApp'tan "merhaba" yazın</p>
  `);
});

// SERVER BAŞLAT
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('🎉 SERVER BAŞLATILDI! (FIXED VERSION)');
  console.log('═══════════════════════════════════════════');
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`📱 Webhook: /webhook`);
  console.log('');
  console.log('💡 WhatsApp\'tan "merhaba" yazın!');
  console.log('═══════════════════════════════════════════');
  console.log('');
});