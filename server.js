// WhatsApp Business API - Backend Server
// MenuMyAnimda - Restoran Sipariş Sistemi

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

// Interactive Messages modülünü import et (DRIVE VERSION)
const {
  sendBusinessMainMenu,
  sendFeaturedBusinesses,
  sendCampaignBusinesses,
  sendBusinessList,
  sendCategoryList,
  sendProductList,
  sendCartSummary,
  sendPaymentMethods,
  sendOrderConfirmation,
  sendTextMessage
} = require('./interactive-messages-DRIVE');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

console.log('🚀 WhatsApp Backend Server başlatılıyor...');
console.log('📱 Phone Number ID:', PHONE_NUMBER_ID);
console.log('🔑 Access Token:', ACCESS_TOKEN ? '✅ Mevcut' : '❌ Eksik');

// ============================================
// WEBHOOK VERIFICATION (Meta için)
// ============================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('🔍 Webhook doğrulama isteği alındı');
  console.log('Mode:', mode);
  console.log('Token:', token);
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook doğrulandı!');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook doğrulama başarısız!');
    res.sendStatus(403);
  }
});

// ============================================
// WEBHOOK MESSAGES (WhatsApp'tan gelen mesajlar)
// ============================================
app.post('/webhook', (req, res) => {
  const body = req.body;
  
  console.log('📱 Yeni webhook isteği:', JSON.stringify(body, null, 2));
  
  if (body.object === 'whatsapp_business_account') {
    body.entry?.forEach(entry => {
      entry.changes?.forEach(change => {
        const value = change.value;
        const messages = value.messages;
        
        if (messages) {
          messages.forEach(message => {
            const phoneNumber = message.from;
            const messageText = message.text?.body;
            const messageType = message.type;
            const interactiveReply = message.interactive?.list_reply || message.interactive?.button_reply;
            
            console.log('👤 Gönderen:', phoneNumber);
            console.log('💬 Mesaj Tipi:', messageType);
            console.log('📝 Mesaj:', messageText);
            
            // Interactive yanıtları işle
            if (interactiveReply) {
              handleInteractiveReply(phoneNumber, interactiveReply.id);
            }
            // Text mesajlarını işle
            else if (messageText) {
              handleTextMessage(phoneNumber, messageText.toLowerCase());
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

// ============================================
// INTERACTIVE REPLY İŞLEYİCİ
// ============================================
async function handleInteractiveReply(phoneNumber, replyId) {
  console.log('🎯 Interactive yanıt:', replyId);
  
  try {
    if (replyId === 'action_new_order') {
      await sendBusinessList(phoneNumber);
    }
    else if (replyId === 'menu_featured') {
      await sendFeaturedBusinesses(phoneNumber);
    }
    else if (replyId === 'menu_campaign') {
      await sendCampaignBusinesses(phoneNumber);
    }
    else if (replyId === 'menu_all') {
      await sendBusinessList(phoneNumber);
    }
    else if (replyId.startsWith('business_')) {
      // Restoran seçildi, kategorileri göster
      await sendCategoryList(phoneNumber, 'Lezzet Durağı');
    }
    else if (replyId.startsWith('cat_')) {
      // Kategori seçildi, ürünleri göster
      const category = replyId.replace('cat_', '');
      await sendProductList(phoneNumber, category);
    }
    else if (replyId.startsWith('prod_')) {
      // Ürün seçildi
      const productId = replyId.replace('prod_', '');
      await handleProductSelection(phoneNumber, productId);
    }
    else if (replyId === 'action_menu') {
      await sendBusinessMainMenu(phoneNumber);
    }
    else if (replyId === 'action_help') {
      await sendTextMessage(phoneNumber,
        'ℹ️ *YARDIM*\n\n' +
        '1️⃣ "Sipariş Ver" ile başlayın\n' +
        '2️⃣ Restoran seçin\n' +
        '3️⃣ Kategori seçin\n' +
        '4️⃣ Ürün seçin\n' +
        '5️⃣ Sepeti onaylayın\n\n' +
        'Sorularınız için: +90 850 346 6945'
      );
    }
    else {
      await sendBusinessMainMenu(phoneNumber);
    }
  } catch (error) {
    console.error('❌ Interactive reply hatası:', error);
    await sendTextMessage(phoneNumber, '❌ Bir hata oluştu. Lütfen tekrar deneyin.');
  }
}

// ============================================
// ÜRÜN SEÇİMİ HANDLER
// ============================================
async function handleProductSelection(phoneNumber, productId) {
  try {
    const { getMenuFromDrive } = require('./interactive-messages-DRIVE');
    const menu = await getMenuFromDrive();
    
    // Tüm ürünleri tek bir array'de topla
    const allProducts = Object.values(menu.products).flat();
    const product = allProducts.find(p => p.id === productId);
    
    if (!product) {
      await sendTextMessage(phoneNumber, '❌ Ürün bulunamadı.');
      return;
    }
    
    // Ürün detayını göster
    let detailText = `✅ *${product.name}*\n\n`;
    detailText += `📝 ${product.description}\n\n`;
    detailText += `💰 Fiyat: ${product.price}\n\n`;
    detailText += `✨ Sepete eklendi!\n\n`;
    detailText += `Başka ürün eklemek için "menü" yazın.`;
    
    await sendTextMessage(phoneNumber, detailText);
  } catch (error) {
    console.error('❌ Ürün seçimi hatası:', error);
    await sendTextMessage(phoneNumber, '❌ Bir hata oluştu. Lütfen tekrar deneyin.');
  }
}

// ============================================
// TEXT MESAJ İŞLEYİCİ
// ============================================
async function handleTextMessage(phoneNumber, text) {
  console.log('🤖 Mesaj işleniyor:', text);
  
  try {
    if (text.includes('merhaba') || text.includes('selam') || text.includes('hi') || text.includes('hello')) {
      await sendBusinessMainMenu(phoneNumber);
    }
    else if (text.includes('menü') || text.includes('menu')) {
      await sendBusinessMainMenu(phoneNumber);
    }
    else if (text.includes('sipariş') || text.includes('siparis') || text.includes('order')) {
      await sendBusinessList(phoneNumber);
    }
    else if (text.includes('kampanya') || text.includes('indirim')) {
      await sendCampaignBusinesses(phoneNumber);
    }
    else if (text.includes('önerilen') || text.includes('populer') || text.includes('popular')) {
      await sendFeaturedBusinesses(phoneNumber);
    }
    else if (text.includes('restoran') || text.includes('restaurant')) {
      await sendBusinessList(phoneNumber);
    }
    else if (text.includes('yardım') || text.includes('help')) {
      await sendTextMessage(phoneNumber,
        'ℹ️ *YARDIM*\n\n' +
        '*Komutlar:*\n' +
        '• "merhaba" - Ana menü\n' +
        '• "sipariş" - Sipariş ver\n' +
        '• "kampanya" - İndirimli yerler\n' +
        '• "restoran" - Tüm restoranlar\n\n' +
        'İyi günler! 😊'
      );
    }
    else {
      // Bilinmeyen komut - Ana menüyü göster
      await sendBusinessMainMenu(phoneNumber);
    }
  } catch (error) {
    console.error('❌ Mesaj işleme hatası:', error);
    await sendTextMessage(phoneNumber, '❌ Bir hata oluştu. "Merhaba" yazarak başlayabilirsiniz.');
  }
}

// ============================================
// ANA SAYFA
// ============================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp Backend - MenuMyAnimda</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #25D366; }
        .status { 
          padding: 10px;
          background: #d4edda;
          border: 1px solid #c3e6cb;
          border-radius: 5px;
          margin: 20px 0;
        }
        .info {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin: 10px 0;
        }
        code {
          background: #f4f4f4;
          padding: 2px 6px;
          border-radius: 3px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 WhatsApp Backend Server Çalışıyor!</h1>
        
        <div class="status">
          ✅ Server aktif - İnteraktif Menü Sistemi Hazır
        </div>
        
        <h2>📋 Sistem Bilgileri:</h2>
        <div class="info">
          <p><strong>Phone Number ID:</strong> ${PHONE_NUMBER_ID}</p>
          <p><strong>Port:</strong> ${PORT}</p>
          <p><strong>Webhook URL:</strong> <code>/webhook</code></p>
          <p><strong>Mod:</strong> Interactive Messages ✨</p>
        </div>
        
        <h2>🧪 Test:</h2>
        <p>WhatsApp'tan <strong>+90 850 346 6945</strong> numarasına şunu yazın:</p>
        <ul>
          <li><strong>"merhaba"</strong> - İnteraktif ana menü gelir 🎯</li>
          <li><strong>"sipariş"</strong> - Restoran listesi gelir 🍽️</li>
          <li><strong>"kampanya"</strong> - İndirimli yerler 🔥</li>
        </ul>
        
        <h2>✨ Özellikler:</h2>
        <ul>
          <li>✅ Interactive List Messages (Butonlu Menü)</li>
          <li>✅ Restoran Seçimi</li>
          <li>✅ Kategori Browsing</li>
          <li>✅ Ürün Listeleme</li>
          <li>✅ Sepet Yönetimi</li>
        </ul>
        
        <p style="margin-top: 30px; color: #666;">
          MenuMyAnimda - Restoran Sipariş Sistemi v2.0
        </p>
      </div>
    </body>
    </html>
  `);
});

// ============================================
// SERVER BAŞLAT
// ============================================
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('🎉 SERVER BAŞARIYLA BAŞLATILDI!');
  console.log('═══════════════════════════════════════════');
  console.log(`📍 Server adresi: http://localhost:${PORT}`);
  console.log(`📱 Webhook: http://localhost:${PORT}/webhook`);
  console.log('');
  console.log('🧪 Test için WhatsApp\'tan mesaj gönderin:');
  console.log('   +90 850 346 6945');
  console.log('');
  console.log('💡 Server\'ı durdurmak için: Ctrl + C');
  console.log('═══════════════════════════════════════════');
  console.log('');
});
