  // Interactive Messages - WhatsApp Business API (DRIVE VERSION)
  // MenuMyAnimda - Drive JSON Entegrasyonu

  const axios = require('axios');
  const fetch = require('node-fetch');
  require('dotenv').config();

  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
  const API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

  // ============================================
  // GOOGLE DRIVE MENU URL
  // ============================================
  // BU URL'İ DEĞİŞTİRİN! (Drive'da menu-drive.json'u yükleyip public yapın)
  const MENU_DRIVE_URL = process.env.MENU_DRIVE_URL || 'https://drive.google.com/uc?export=download&id=YOUR_FILE_ID';

  // Cache
  let menuCache = null;
  let lastFetch = null;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 dakika

  // ============================================
  // DRIVE'DAN MENÜ OKU
  // ============================================
  async function getMenuFromDrive() {
    try {
      // Cache kontrolü (5 dakika)
      if (menuCache && lastFetch && (Date.now() - lastFetch < CACHE_DURATION)) {
        console.log('📦 Cache\'ten menü döndürülüyor');
        return menuCache;
      }

      console.log('📥 Drive\'dan menü indiriliyor...');
      const response = await fetch(MENU_DRIVE_URL);
      
      if (!response.ok) {
        throw new Error(`Drive yanıt hatası: ${response.status}`);
      }
      
      const menuData = await response.json();
      
      // Cache'e kaydet
      menuCache = menuData;
      lastFetch = Date.now();
      
      console.log('✅ Drive menü yüklendi!');
      console.log(`📊 ${menuData.businesses?.length || 0} işletme, ${menuData.categories?.length || 0} kategori`);
      
      return menuData;
    } catch (error) {
      console.error('❌ Drive okuma hatası:', error.message);
      
      // Cache varsa onu dön
      if (menuCache) {
        console.log('⚠️ Cache\'ten eski menü döndürülüyor');
        return menuCache;
      }
      
      // Cache de yoksa fallback
      return getFallbackMenu();
    }
  }

  // ============================================
  // FALLBACK MENU (Drive erişilemezse)
  // ============================================
  function getFallbackMenu() {
    console.log('🔄 Fallback menü kullanılıyor');
    return {
      businesses: [
        { id: 'business_lezzet', name: '🍖 Lezzet Durağı', category: 'Kebap & Türk Mutfağı', featured: true, campaign: true, rating: 4.8 }
      ],
      categories: [
        { id: 'cat_kebap', title: '🍖 Kebaplar', description: 'Izgara kebap çeşitleri', section: 'Ana Yemekler' }
      ],
      products: {
        'kebap': [
          { id: 'prod_001', name: 'Adana Kebap', price: '250₺', description: 'Közde pişmiş', available: true }
        ]
      }
    };
  }

  // ============================================
  // ANA MENÜ - İLK EKRAN (DEĞİŞMEDİ!)
  // ============================================
  async function sendBusinessMainMenu(phoneNumber) {
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
          sections: [
            {
              title: '🛒 Sipariş İşlemleri',
              rows: [
                {
                  id: 'action_new_order',
                  title: '🛒 Sipariş Ver',
                  description: 'Yeni sipariş oluştur'
                },
                {
                  id: 'action_my_orders',
                  title: '📦 Siparişlerim',
                  description: 'Geçmiş siparişlerimi gör'
                },
                {
                  id: 'action_track_order',
                  title: '📍 Sipariş Takip',
                  description: 'Son siparişimi takip et'
                }
              ]
            },
            {
              title: '🏪 Restoran Seçenekleri',
              rows: [
                {
                  id: 'menu_featured',
                  title: '⭐ Önerilen Restoranlar',
                  description: 'Popüler ve yüksek puanlı'
                },
                {
                  id: 'menu_campaign',
                  title: '🔥 Kampanyalı Yerler',
                  description: 'İndirimli siparişler'
                },
                {
                  id: 'menu_all',
                  title: '📋 Tüm Restoranlar',
                  description: 'Tüm listeyi görüntüle'
                }
              ]
            },
            {
              title: 'ℹ️ Yardım & Bilgi',
              rows: [
                {
                  id: 'action_help',
                  title: 'ℹ️ Yardım',
                  description: 'Nasıl sipariş verebilirim?'
                },
                {
                  id: 'action_contact',
                  title: '📞 İletişim',
                  description: 'Bize ulaşın'
                }
              ]
            }
          ]
        }
      }
    };

    return await sendInteractiveMessage(data);
  }

  // ============================================
  // ÖNERİLEN RESTORANLAR (Drive'dan)
  // ============================================
  async function sendFeaturedBusinesses(phoneNumber) {
    const menu = await getMenuFromDrive();
    const featured = menu.businesses.filter(b => b.featured);
    
    const rows = featured.map(b => ({
      id: b.id,
      title: b.name,
      description: `⭐ ${b.rating} • ${b.category}`
    }));

    const data = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: '⭐ Önerilen Restoranlar'
        },
        body: {
          text: `${featured.length} popüler restoran! En çok tercih edilen yerler sizin için seçildi.`
        },
        footer: {
          text: 'Yüksek puanlı restoranlar'
        },
        action: {
          button: 'Restoran Seç',
          sections: [{
            title: 'Popüler Seçimler',
            rows: rows
          }]
        }
      }
    };

    return await sendInteractiveMessage(data);
  }

  // ============================================
  // KAMPANYALI RESTORANLAR (Drive'dan)
  // ============================================
  async function sendCampaignBusinesses(phoneNumber) {
    const menu = await getMenuFromDrive();
    const campaigns = menu.businesses.filter(b => b.campaign);
    
    const rows = campaigns.map(b => ({
      id: b.id,
      title: b.name,
      description: `🔥 İndirimli • ${b.category}`
    }));

    const data = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: '🔥 Kampanyalı Restoranlar'
        },
        body: {
          text: `${campaigns.length} özel kampanya! Şimdi sipariş verin, indirimli fiyatlardan yararlanın.`
        },
        footer: {
          text: 'Fırsatları kaçırmayın!'
        },
        action: {
          button: 'Restoran Seç',
          sections: [{
            title: 'Kampanyalı Yerler',
            rows: rows
          }]
        }
      }
    };

    return await sendInteractiveMessage(data);
  }

  // ============================================
  // TÜM RESTORANLAR (Drive'dan)
  // ============================================
  async function sendBusinessList(phoneNumber, searchKeyword = null) {
    const menu = await getMenuFromDrive();
    let businesses = menu.businesses;

    // Search filtresi
    if (searchKeyword) {
      businesses = businesses.filter(b => 
        b.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        b.category.toLowerCase().includes(searchKeyword.toLowerCase())
      );
    }

    // Sonuç bulunamadı
    if (businesses.length === 0) {
      return await sendTextMessage(
        phoneNumber,
        `🔍 *ARAMA SONUCU*\n\n` +
        `"${searchKeyword}" için sonuç bulunamadı.\n\n` +
        `Tüm restoranları görmek için "restoran" yazın.`
      );
    }

    // List message oluştur (max 10 item)
    const rows = businesses.slice(0, 10).map(b => ({
      id: b.id,
      title: b.name,
      description: b.category
    }));

    const data = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: searchKeyword ? `🔍 "${searchKeyword}" Sonuçları` : '🍽️ Hoş Geldiniz!'
        },
        body: {
          text: searchKeyword 
            ? `${businesses.length} restoran bulundu. Sipariş vermek istediğiniz restoranı seçin:`
            : 'Menüm Yanımda\'ya hoş geldiniz! Sipariş vermek istediğiniz restoranı seçin:\n\n💡 *İpucu:* Aramak için restoran adı yazın (örn: "pizza", "kebap")'
        },
        footer: {
          text: searchKeyword ? `${businesses.length} sonuç` : 'Powered by Menüm Yanımda'
        },
        action: {
          button: 'Restoran Seç',
          sections: [
            {
              title: searchKeyword ? 'Arama Sonuçları' : 'Aktif Restoranlar',
              rows: rows
            }
          ]
        }
      }
    };

    return await sendInteractiveMessage(data);
  }

  // ============================================
  // KATEGORİ LİSTESİ (Drive'dan)
  // ============================================
  async function sendCategoryList(phoneNumber, businessName) {
    const menu = await getMenuFromDrive();
    const categories = menu.categories;
    
    // Section bazlı gruplama
    const sections = [];
    const grouped = {};
    
    categories.forEach(cat => {
      const section = cat.section || 'Diğer';
      if (!grouped[section]) {
        grouped[section] = [];
      }
      grouped[section].push({
        id: cat.id,
        title: cat.title,
        description: cat.description
      });
    });
    
    // Sections oluştur
    for (const [sectionName, rows] of Object.entries(grouped)) {
      sections.push({
        title: sectionName,
        rows: rows
      });
    }

    const data = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: `📋 ${businessName} Menüsü`
        },
        body: {
          text: 'Kategorilerimize göz atın ve sipariş verin!'
        },
        footer: {
          text: 'Lezzetli yemekler sizi bekliyor'
        },
        action: {
          button: 'Kategoriler',
          sections: sections
        }
      }
    };

    return await sendInteractiveMessage(data);
  }

  // ============================================
  // ÜRÜN LİSTESİ (Drive'dan) - LIST MESSAGE
  // ============================================
  async function sendProductList(phoneNumber, categoryName) {
    const menu = await getMenuFromDrive();
    const categoryProducts = menu.products[categoryName] || [];
    
    if (categoryProducts.length === 0) {
      return await sendTextMessage(phoneNumber, '❌ Bu kategoride ürün bulunamadı.');
    }

    // Sadece mevcut ürünleri göster
    const availableProducts = categoryProducts.filter(p => p.available !== false);
    
    // List message rows oluştur
    const rows = availableProducts.map(p => ({
      id: `prod_${p.id}`,
      title: p.name,
      description: `${p.description || ''} - ${p.price}`
    }));

    const data = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: `🍽️ ${categoryName.toUpperCase()}`
        },
        body: {
          text: `${availableProducts.length} lezzetli ürün sizleri bekliyor!\n\nLütfen seçim yapın:`
        },
        footer: {
          text: 'Sipariş vermek için seçin'
        },
        action: {
          button: 'ÜRÜNLER',
          sections: [
            {
              title: 'Ürün Seçenekleri',
              rows: rows
            }
          ]
        }
      }
    };

    return await sendInteractiveMessage(data);
  }

  // ============================================
  // SEPET ÖZET BUTTON MESSAGE (DEĞİŞMEDİ!)
  // ============================================
  async function sendCartSummary(phoneNumber, cart) {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const itemsText = cart.map((item, index) => 
      `${index + 1}. ${item.name}\n   ${item.quantity}x ${item.price}₺ = ${item.price * item.quantity}₺`
    ).join('\n\n');

    const data = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: '🛒 Sepetiniz'
        },
        body: {
          text: `${itemsText}\n\n${'━'.repeat(30)}\n\n💰 *TOPLAM: ${total}₺*\n🚚 Teslimat: 20₺\n\n✅ *GENEL TOPLAM: ${total + 20}₺*`
        },
        footer: {
          text: `${cart.length} ürün`
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'cart_checkout',
                title: '✅ Siparişi Tamamla'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'cart_menu',
                title: '➕ Ürün Ekle'
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

    return await sendInteractiveMessage(data);
  }

  // ============================================
  // ÖDEME YÖNTEMİ SEÇİMİ (DEĞİŞMEDİ!)
  // ============================================
  async function sendPaymentMethods(phoneNumber, total) {
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
          text: `Toplam: *${total}₺*\n\nLütfen ödeme yönteminizi seçin:`
        },
        footer: {
          text: 'Güvenli ödeme'
        },
        action: {
          button: 'Ödeme Seç',
          sections: [
            {
              title: 'Nakit Ödeme',
              rows: [
                {
                  id: 'payment_cash',
                  title: '💵 Nakit',
                  description: 'Kapıda nakit ödeme'
                }
              ]
            },
            {
              title: 'Kart ile Ödeme',
              rows: [
                {
                  id: 'payment_card',
                  title: '💳 Kredi/Banka Kartı',
                  description: 'Online güvenli ödeme'
                },
                {
                  id: 'payment_sodexo',
                  title: '🎫 Pluxee (Sodexo)',
                  description: 'Yemek kartı'
                },
                {
                  id: 'payment_multinet',
                  title: '🎟️ Multinet',
                  description: 'Multinet kartı'
                }
              ]
            }
          ]
        }
      }
    };

    return await sendInteractiveMessage(data);
  }

  // ============================================
  // SİPARİŞ ONAY MESAJI (DEĞİŞMEDİ!)
  // ============================================
  async function sendOrderConfirmation(phoneNumber, orderDetails) {
    const data = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: {
        body: `✅ *SİPARİŞİNİZ ALINDI!*\n\n` +
              `📋 Sipariş No: *${orderDetails.orderId}*\n` +
              `💰 Toplam: *${orderDetails.total}₺*\n` +
              `💳 Ödeme: ${orderDetails.paymentMethod}\n` +
              `📍 Adres: ${orderDetails.address}\n\n` +
              `⏱️ Tahmini Teslimat: *${orderDetails.estimatedTime} dakika*\n\n` +
              `Siparişiniz hazırlanmaya başlandı.\n` +
              `Durum güncellemeleri için bildirim alacaksınız.\n\n` +
              `Teşekkür ederiz! 🙏`
      }
    };

    return await axios.post(API_URL, data, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // ============================================
  // YARDIMCI FONKSİYONLAR (DEĞİŞMEDİ!)
  // ============================================
  async function sendInteractiveMessage(data) {
    try {
      const response = await axios.post(API_URL, data, {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Interactive mesaj gönderildi!', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Interactive mesaj hatası:', error.response?.data || error.message);
      throw error;
    }
  }

  async function sendTextMessage(phoneNumber, text) {
    const data = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: { body: text }
    };
    
    try {
      const response = await axios.post(API_URL, data, {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('❌ Text mesaj hatası:', error.response?.data || error.message);
      throw error;
    }
  }

  // Export
  module.exports = {
    sendBusinessMainMenu,
    sendFeaturedBusinesses,
    sendCampaignBusinesses,
    sendBusinessList,
    sendCategoryList,
    sendProductList,
    sendCartSummary,
    sendPaymentMethods,
    sendOrderConfirmation,
    sendTextMessage,
    getMenuFromDrive  // Test için export
  };
