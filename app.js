require("dotenv").config();
const express = require("express");
const axios = require("axios");
const mysql = require("mysql2");
const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

// 設置 MySQL 連線
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error("MySQL 連線失敗:", err);
  } else {
    console.log("MySQL 連線成功");
  }
});

// 首頁路由
app.get("/", (req, res) => {
  res.render("index", {
    distance: null,
    duration: null,
    origin_name: "",
    destination_name: "",
    address1: "",
    address2: "",
    error: null,
  });
});

// 計算距離並存入資料庫
app.post("/calculate-distance", async (req, res) => {
  const { origin_name, destination_name, address1, address2 } = req.body;

  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    // 將地址轉換為經緯度
    const geocodeUrl = (address) =>
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address
      )}&key=${apiKey}`;
    const location1 = await axios.get(geocodeUrl(address1));
    const location2 = await axios.get(geocodeUrl(address2));

    if (!location1.data.results[0] || !location2.data.results[0]) {
      return res.render("index", {
        error: "無法找到其中一個地址，請檢查地址是否正確",
        origin_name,
        destination_name,
        address1,
        address2,
        distance: null,
        duration: null,
      });
    }

    // 使用用戶輸入的原始地址
    const originAddress = address1;
    const destinationAddress = address2;
    const coords1 = location1.data.results[0].geometry.location;
    const coords2 = location2.data.results[0].geometry.location;

    // 計算兩個位置之間的距離和預估時間
    const distanceUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${coords1.lat},${coords1.lng}&destinations=${coords2.lat},${coords2.lng}&mode=driving&key=${apiKey}`;
    const distanceData = await axios.get(distanceUrl);
    const distance = distanceData.data.rows[0].elements[0].distance.value; // 距離（公尺）
    const duration = distanceData.data.rows[0].elements[0].duration.value; // 時間（秒）

    const travelDistanceM = distance;
    const travelTimeHr = Math.floor(duration / 3600); // 小時部分
    const travelTimeMin = Math.floor((duration % 3600) / 60); // 分鐘部分

    // 插入資料到 MySQL 資料庫的 orders 表，包含新增的暱稱欄位
    const query = `
        INSERT INTO orders (origin_name, destination_name, origin_address, destination_address, travel_distance_m, travel_time_hr, travel_time_min)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
    const values = [
      origin_name,
      destination_name,
      originAddress,
      destinationAddress,
      travelDistanceM,
      travelTimeHr,
      travelTimeMin,
    ];

    db.query(query, values, (err, result) => {
      if (err) {
        console.error("資料插入失敗:", err);
        res.render("index", {
          error: "資料插入失敗",
          origin_name,
          destination_name,
          address1,
          address2,
          distance: null,
          duration: null,
        });
      } else {
        console.log("資料插入成功");
        res.render("index", {
          distance: `${travelDistanceM} 公尺`,
          duration: `${travelTimeHr} 小時 ${travelTimeMin} 分鐘`,
          origin_name,
          destination_name,
          address1,
          address2,
          error: null,
        });
      }
    });
  } catch (error) {
    console.error(error);
    res.render("index", {
      error: "無法計算距離，請檢查地址是否正確",
      origin_name,
      destination_name,
      address1,
      address2,
      distance: null,
      duration: null,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
