if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("SUPABASE_URL と SUPABASE_ANON_KEY を環境変数に設定してください");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function toClientReservation(row) {
  return {
    id: String(row.id),
    name: row.name,
    date: row.date,
    time: row.time,
    guests: row.guests,
    phone: row.phone,
    createdAt: new Date(row.created_at).getTime(),
  };
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get("/api/reservations", async (req, res) => {
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "予約一覧の取得に失敗しました" });
  }

  res.json(data.map(toClientReservation));
});

app.post("/api/reservations", async (req, res) => {
  const { name, date, time, guests, phone } = req.body;

  if (!name || !date || !time || guests == null || !phone) {
    return res.status(400).json({ error: "必須項目が不足しています" });
  }

  const insertPayload = {
    name: String(name).trim(),
    date: String(date),
    time: String(time),
    guests: Number(guests),
    phone: String(phone).trim(),
  };

  const { data, error } = await supabase
    .from("reservations")
    .insert(insertPayload)
    .select("id, name, date, time, guests, phone, created_at")
    .single();

  if (error) {
    console.error("[POST /api/reservations] Supabase error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload: insertPayload,
    });
    return res.status(500).json({ error: "予約の保存に失敗しました" });
  }

  res.status(201).json(toClientReservation(data));
});

app.delete("/api/reservations/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", req.params.id)
    .select();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "予約の削除に失敗しました" });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: "予約が見つかりません" });
  }

  res.sendStatus(204);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Reservation form: http://localhost:${PORT}/reservation.html`);
});
