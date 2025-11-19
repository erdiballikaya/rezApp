rezApp - Havalimanı Transfer Rezervasyon Uygulaması
---------------------------------------------------

Özet
-----
rezApp; havalimanına yeni inmiş yolcuların, şehir içi transfer için
nereden nereye gideceğini girip anında rota ve tahmini fiyat görebildiği
basit bir rezervasyon uygulamasıdır.

Özellikler
----------
- Harita üzerinden rota gösterimi (Leaflet + OpenStreetMap)
- Nominatim ile adres arama ve otomatik tamamlama
- OSRM ile mesafe ve süre hesaplama
- Tahmini fiyat hesaplama (açılış ücreti + km başı ücret)
- Rezervasyonların MongoDB'de saklanması
- JWT tabanlı admin girişi
- Admin panelinde rezervasyon listeleme
- Rezervasyon durumları:
  - Beklemede (sarı)
  - Onaylandı (yeşil)
  - Reddedildi (kırmızı)
- Admin panelinden tek tıkla onay / red butonları

Teknolojiler
------------
Backend:
- Node.js
- Express
- MongoDB (Mongoose)
- JWT (jsonwebtoken)
- bcrypt (şifre hashleme)
- dotenv (config)

Frontend:
- HTML, CSS, Vanilla JS
- Leaflet harita
- Nominatim & OSRM entegrasyonu

Kurulum
-------
1. Bağımlılıkları yükle:
   npm install

2. .env dosyası oluştur ve aşağıdaki değerleri ekle:

   PORT=4000
   MONGO_URI=mongodb+srv://<user>:<pass>@cluster/rezApp
   JWT_SECRET=gizli-key
   ADMIN_EMAIL=admin
   ADMIN_PASSWORD=admin12345
   BASE_PRICE=50
   PRICE_PER_KM=10

3. Uygulamayı başlat:
   npm start

4. Tarayıcıdan aç:
   Müşteri arayüzü: http://localhost:4000
   Admin panel:     http://localhost:4000/admin.html

Notlar
------
- Fiyatlandırma BASE_PRICE ve PRICE_PER_KM değişkenleriyle .env üzerinden yönetilir.
- Admin panelinde satır renkleri:
  - Sarı: Beklemede
  - Yeşil: Onaylandı
  - Kırmızı: Reddedildi
- Rezervasyon durum güncelleme endpoint'i:
  PATCH /api/admin/reservations/:id/status  (body: { "isApproved": true/false })
