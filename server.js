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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY を環境変数に設定してください");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
function normalizeTime(time) {
  const [hour = "0", minute = "0"] = String(time).split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function toClientReservation(row) {
  return {
    id: String(row.id),
    name: row.name,
    date: row.date,
    time: normalizeTime(row.time),
    guests: row.guests,
    phone: row.phone,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function getSlotStatus(booked, capacity) {
  const remaining = capacity - booked;

  if (remaining <= 0) {
    return "full";
  }

  // 上限が1件の場合は「空き」か「満席」のみ
  if (capacity === 1) {
    return "available";
  }

  // 残り1件以下 かつ 上限2件以上の場合のみ「残りわずか」
  if (remaining === 1) {
    return "few";
  }

  return "available";
}

async function countReservations(date, time) {
  const normalizedTime = normalizeTime(time);

  const { count, error } = await supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("date", date)
    .in("time", [normalizedTime, `${normalizedTime}:00`]);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function getTimeSlotByTime(time) {
  const normalizedTime = normalizeTime(time);

  const { data, error } = await supabase
    .from("time_slots")
    .select("id, time, capacity")
    .eq("time", normalizedTime)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

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

app.get("/api/timeslots", async (req, res) => {
  const { date } = req.query;

  if (!date || !isValidDate(date)) {
    return res.status(400).json({ error: "date パラメータ（YYYY-MM-DD）が必要です" });
  }

  const { data: slots, error: slotsError } = await supabase
    .from("time_slots")
    .select("id, time, capacity")
    .order("time", { ascending: true });

  if (slotsError) {
    console.error("[GET /api/timeslots] Supabase error:", slotsError);
    return res.status(500).json({ error: "時間帯の取得に失敗しました" });
  }

  try {
    const availability = await Promise.all(
      (slots ?? []).map(async (slot) => {
        const time = normalizeTime(slot.time);
        const booked = await countReservations(date, time);
        const capacity = Number(slot.capacity);
        const remaining = Math.max(capacity - booked, 0);

        return {
          id: slot.id,
          time,
          capacity,
          booked,
          remaining,
          status: getSlotStatus(booked, capacity),
        };
      })
    );

    res.json(availability);
  } catch (error) {
    console.error("[GET /api/timeslots] Supabase error:", error);
    res.status(500).json({ error: "空き状況の取得に失敗しました" });
  }
});

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

  if (!isValidDate(String(date))) {
    return res.status(400).json({ error: "予約日の形式が正しくありません" });
  }

  const normalizedTime = normalizeTime(time);

  let slot;

  try {
    slot = await getTimeSlotByTime(normalizedTime);
  } catch (error) {
    console.error("[POST /api/reservations] Supabase error:", error);
    return res.status(500).json({ error: "時間帯の確認に失敗しました" });
  }

  if (!slot) {
    return res.status(400).json({ error: "指定された時間帯は存在しません" });
  }

  try {
    const booked = await countReservations(String(date), normalizedTime);

    if (booked >= Number(slot.capacity)) {
      return res.status(409).json({ error: "この時間帯は満席です" });
    }
  } catch (error) {
    console.error("[POST /api/reservations] Supabase error:", error);
    return res.status(500).json({ error: "空き状況の確認に失敗しました" });
  }

  const insertPayload = {
    name: String(name).trim(),
    date: String(date),
    time: normalizedTime,
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
  const { data, error } = await supabaseAdmin
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

// 時間帯一覧取得
app.get("/api/timeslots/all", async (req, res) => {
  const { data, error } = await supabase
    .from("time_slots")
    .select("id, time, capacity")
    .order("time", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 時間帯追加
app.post("/api/timeslots", async (req, res) => {
  const { time, capacity } = req.body;
  if (!time || !capacity) return res.status(400).json({ error: "time と capacity が必要です" });
  const { data, error } = await supabaseAdmin
    .from("time_slots")
    .insert({ time, capacity: Number(capacity) })
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// 時間帯削除
app.delete("/api/timeslots/:id", async (req, res) => {
  const { error } = await supabaseAdmin
    .from("time_slots")
    .delete()
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// 時間帯の上限変更
app.patch("/api/timeslots/:id", async (req, res) => {
  const { capacity } = req.body;
  if (!capacity) return res.status(400).json({ error: "capacity が必要です" });
  const { data, error } = await supabaseAdmin
    .from("time_slots")
    .update({ capacity: Number(capacity) })
    .eq("id", req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Reservation form: http://localhost:${PORT}/reservation.html`);
});
