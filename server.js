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
    else if (replyId === 'cart_continue') {
      // Alışverişe devam
      await sendBusinessMainMenu(phoneNumber);
    }
    else if (replyId === 'cart_checkout') {
      // Sipariş ver - Adres sor
      await askDeliveryAddress(phoneNumber);
    }
    else if (replyId === 'cart_clear') {
      // Sepeti boşalt
      delete userCarts[phoneNumber];
      await sendTextMessage(phoneNumber, '🗑️ Sepetiniz boşaltıldı.\n\n"Menü" yazarak yeni sipariş verebilirsiniz.');
    }
    else if (replyId.startsWith('payment_')) {
      // Ödeme yöntemi seçildi
      if (!userOrders[phoneNumber]) {
        userOrders[phoneNumber] = {};
      }
      userOrders[phoneNumber].payment = replyId;
      
      // Sipariş özeti göster
      await showOrderSummary(phoneNumber);
    }
    else if (replyId === 'order_confirm') {
      // Siparişi onayla
      await confirmOrder(phoneNumber);
    }
    else if (replyId === 'order_cancel' || replyId === 'address_cancel') {
      // Sipariş iptal
      delete userCarts[phoneNumber];
      delete userOrders[phoneNumber];
      await sendTextMessage(phoneNumber, '❌ Sipariş iptal edildi.\n\n"Menü" yazarak yeni sipariş verebilirsiniz.');
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
// SEPET YÖNETİMİ (In-Memory - Basit)
// ============================================
const userCarts = {}; // phoneNumber: [{product, quantity, price}]
const userOrders = {}; // phoneNumber: {address, payment, cart, orderNo}

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
    
    // Sepete ekle
    if (!userCarts[phoneNumber]) {
      userCarts[phoneNumber] = [];
    }
    
    // Fiyatı parse et (250₺ → 250)
    const price = parseInt(product.price.replace(/[^\d]/g, ''));
    
    // Aynı ürün varsa miktarı artır
    const existingItem = userCarts[phoneNumber].find(item => item.id === product.id);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      userCarts[phoneNumber].push({
        id: product.id,
        name: product.name,
        price: price,
        quantity: 1
      });
    }
    
    // Sepet özetini göster
    await showCart(phoneNumber);
    
  } catch (error) {
    console.error('❌ Ürün seçimi hatası:', error);
    await sendTextMessage(phoneNumber, '❌ Bir hata oluştu. Lütfen tekrar deneyin.');
  }
}

// ============================================
// SEPET GÖSTER (BUTTON MESSAGE)
// ============================================
async function showCart(phoneNumber) {
  const cart = userCarts[phoneNumber] || [];
  
  if (cart.length === 0) {
    await sendTextMessage(phoneNumber, '🛒 Sepetiniz boş.\n\n"Menü" yazarak alışverişe başlayın.');
    return;
  }
  
  // Sepet içeriği
  const itemsText = cart.map(item => 
    `• ${item.name} x${item.quantity} = ${item.price * item.quantity}₺`
  ).join('\n');
  
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '🛒 SEPETİNİZ'
      },
      body: {
        text: `${itemsText}\n\n💰 Toplam: ${total}₺`
      },
      footer: {
        text: `${cart.length} ürün`
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'cart_continue',
              title: '➕ Alışverişe Devam'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'cart_checkout',
              title: '✅ Sipariş Ver'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'cart_clear',
              title: '🗑️ Sepeti Boşalt'
            }
          }
        ]
      }
    }
  };
  
  await sendInteractiveMessage(data);
}

// ============================================
// TESLİMAT ADRESİ SOR
// ============================================
async function askDeliveryAddress(phoneNumber) {
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '📍 Teslimat Adresi'
      },
      body: {
        text: 'Lütfen teslimat adresinizi yazın.\n\nÖrnek: Atatürk Cad. No:123 Daire:5 Beşiktaş/İstanbul'
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'address_cancel',
              title: '❌ İptal'
            }
          }
        ]
      }
    }
  };
  
  // Kullanıcıyı "adres bekleniyor" moduna al
  if (!userOrders[phoneNumber]) {
    userOrders[phoneNumber] = {};
  }
  userOrders[phoneNumber].waitingFor = 'address';
  
  await sendInteractiveMessage(data);
}

// ============================================
// ÖDEME YÖNTEMİ SOR (LIST MESSAGE)
// ============================================
async function askPaymentMethod(phoneNumber) {
  const cart = userCarts[phoneNumber] || [];
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: '💳 Ödeme Yöntemi'
      },
      body: {
        text: `Nasıl ödeme yapmak istersiniz?\n\n💰 Toplam: ${total}₺`
      },
      footer: {
        text: 'Güvenli ödeme'
      },
      action: {
        button: 'Ödeme Seç',
        sections: [
          {
            title: 'Ödeme Yöntemleri',
            rows: [
              {
                id: 'payment_cash',
                title: '💵 Nakit',
                description: 'Kapıda nakit ödeme'
              },
              {
                id: 'payment_card',
                title: '💳 Kredi Kartı',
                description: 'Online kart ödemesi'
              },
              {
                id: 'payment_meal',
                title: '🎫 Yemek Kartı',
                description: 'Sodexo, Multinet vb.'
              }
            ]
          }
        ]
      }
    }
  };
  
  await sendInteractiveMessage(data);
}

// ============================================
// SİPARİŞ ÖZETİ GÖSTER (BUTTON MESSAGE)
// ============================================
async function showOrderSummary(phoneNumber) {
  const order = userOrders[phoneNumber];
  const cart = userCarts[phoneNumber] || [];
  
  if (!order || !order.address || !order.payment) {
    await sendTextMessage(phoneNumber, '❌ Sipariş bilgileri eksik.');
    return;
  }
  
  // Sipariş numarası oluştur
  const orderNo = `SIP-${Date.now().toString().slice(-6)}`;
  order.orderNo = orderNo;
  
  // Sepet özeti
  const itemsText = cart.map(item => 
    `• ${item.name} x${item.quantity} - ${item.price * item.quantity}₺`
  ).join('\n');
  
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const paymentText = {
    'payment_cash': '💵 Nakit',
    'payment_card': '💳 Kredi Kartı',
    'payment_meal': '🎫 Yemek Kartı'
  }[order.payment] || 'Nakit';
  
  const data = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '📦 SİPARİŞ ÖZETİ'
      },
      body: {
        text: `${itemsText}\n\n` +
              `📍 Adres: ${order.address}\n\n` +
              `💳 Ödeme: ${paymentText}\n\n` +
              `💰 Toplam: ${total}₺\n` +
              `📋 No: ${orderNo}`
      },
      footer: {
        text: 'Siparişi onaylıyor musunuz?'
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'order_confirm',
              title: '✅ Onayla'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'order_cancel',
              title: '❌ İptal'
            }
          }
        ]
      }
    }
  };
  
  await sendInteractiveMessage(data);
}

// ============================================
// SİPARİŞ ONAYLA
// ============================================
async function confirmOrder(phoneNumber) {
  const order = userOrders[phoneNumber];
  
  if (!order || !order.orderNo) {
    await sendTextMessage(phoneNumber, '❌ Sipariş bulunamadı.');
    return;
  }
  
  const confirmText = `✅ *Siparişiniz alındı!*\n\n` +
                     `📋 No: ${order.orderNo}\n` +
                     `⏱️ Tahmini: 30-45 dk\n\n` +
                     `Teşekkür ederiz! 🙏`;
  
  await sendTextMessage(phoneNumber, confirmText);
  
  // Sepeti ve siparişi temizle
  delete userCarts[phoneNumber];
  delete userOrders[phoneNumber];
}

// ============================================
// INTERACTIVE MESSAGE HELPER
// ============================================
async function sendInteractiveMessage(data) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      data,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Interactive mesaj gönderildi');
    return response.data;
  } catch (error) {
    console.error('❌ Interactive mesaj hatası:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// TEXT MESAJ İŞLEYİCİ
// ============================================
async function handleTextMessage(phoneNumber, text) {
  console.log('🤖 Mesaj işleniyor:', text);
  
  try {
    // Adres bekleniyor mu kontrol et
    if (userOrders[phoneNumber]?.waitingFor === 'address') {
      // Adresi kaydet
      userOrders[phoneNumber].address = text;
      userOrders[phoneNumber].waitingFor = null;
      
      // Ödeme yöntemi sor
      await askPaymentMethod(phoneNumber);
      return;
    }
    
    // Normal komutlar
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
    else if (text.includes('sepet') || text.includes('cart')) {
      await showCart(phoneNumber);
    }
    else if (text.includes('yardım') || text.includes('help')) {
      await sendTextMessage(phoneNumber,
        'ℹ️ *YARDIM*\n\n' +
        '*Komutlar:*\n' +
        '• "merhaba" - Ana menü\n' +
        '• "sipariş" - Sipariş ver\n' +
        '• "kampanya" - İndirimli yerler\n' +
        '• "restoran" - Tüm restoranlar\n' +
        '• "sepet" - Sepeti görüntüle\n\n' +
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
