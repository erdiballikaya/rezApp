require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const User = require("./models/user");
const Reservation = require("./models/reservation");
const authMiddleware = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 4000;

const BASE_PRICE = Number(process.env.BASE_PRICE || 50);
const PRICE_PER_KM = Number(process.env.PRICE_PER_KM || 10);


app.use(cors());
app.use(express.json());

// Static files (frontend)
app.use(express.static(path.join(__dirname, "public")));

// MongoDB bağlantısı
mongoose
  .connect(process.env.MONGO_URI, { dbName: "reservationdb" })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

// Basit admin seed (ilk çalıştırmada varsa skip)
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("ADMIN_EMAIL veya ADMIN_PASSWORD env değişkenleri eksik.");
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) {
    console.log("Admin user already exists.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({ email, passwordHash });
  console.log(`Admin user created: ${email}`);
}
seedAdmin().catch(console.error);

function calculatePriceBackend(distanceKm) {
  if (!distanceKm || isNaN(distanceKm)) return null;
  const price = BASE_PRICE + distanceKm * PRICE_PER_KM;
  return Math.round(price * 100) / 100;
}


// ---------- API Routes ----------

// Public: Rezervasyon kaydet
app.post("/api/reservations", async (req, res) => {
  try {
    const {
      fromAddress,
      fromFull,
      toAddress,
      toFull,
      distanceKm,
      durationMinutes,
      price,
      phone,
      createdAt
    } = req.body;

    if (!fromAddress || !toAddress || !phone) {
      return res.status(400).json({ error: "fromAddress, toAddress, phone zorunludur." });
    }

    const reservation = await Reservation.create({
      fromAddress,
      fromFull,
      toAddress,
      toFull,
      distanceKm,
      durationMinutes,
      price,
      phone,
      createdAtClient: createdAt
    });

    return res.status(201).json({ success: true, id: reservation._id });
  } catch (err) {
    console.error("Create reservation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Auth: login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email ve password zorunludur." });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Geçersiz kullanıcı veya şifre." });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Geçersiz kullanıcı veya şifre." });

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: rezervasyonları listele (JWT ile korunan)
app.get("/api/admin/reservations", authMiddleware, async (req, res) => {
  try {
    const reservations = await Reservation.find({})
      .sort({ createdAt: -1 })
      .lean();

    return res.json(reservations);
  } catch (err) {
    console.error("List reservations error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: rezervasyon onay / red
app.patch("/api/admin/reservations/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved } = req.body;

    if (typeof isApproved !== "boolean") {
      return res.status(400).json({ error: "isApproved alanı true veya false olmalı." });
    }

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ error: "Rezervasyon bulunamadı." });
    }

    reservation.isApproved = isApproved;
    await reservation.save();

    return res.json({
      success: true,
      id: reservation._id,
      isApproved: reservation.isApproved
    });
  } catch (err) {
    console.error("Update reservation status error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// Fiyat konfigürasyonu (frontend için)
app.get("/api/config/pricing", (req, res) => {
  return res.json({
    basePrice: BASE_PRICE,
    pricePerKm: PRICE_PER_KM
  });
});


// Fallback: SPA gibi index/admin’i static'ten verdiğimiz için ekstra bir şeye gerek yok

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
