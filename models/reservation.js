const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    fromAddress: String,
    fromFull: String,
    toAddress: String,
    toFull: String,
    distanceKm: Number,
    durationMinutes: Number,
    price: Number,
    phone: String,
    createdAtClient: String,

    // null  => beklemede
    // true  => onaylandı
    // false => reddedildi
    isApproved: { type: Boolean, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reservation", reservationSchema);
