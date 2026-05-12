const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const rooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: "服务器错误", detail: error.message });
  }
});

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      port,
      local: `http://localhost:${port}`,
      lan: getLanAddresses().map((address) => `http://${address}:${port}`),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(req);
    const roomId = createRoomId();
    rooms.set(roomId, {
      id: roomId,
      seq: 1,
      players: { black: true, white: false },
      game: body.game,
      updatedAt: Date.now(),
    });
    sendJson(res, 200, { roomId, player: 1, seq: 1, game: body.game });
    return;
  }

  if (parts[0] === "api" && parts[1] === "rooms" && parts[2]) {
    const roomId = parts[2].toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      sendJson(res, 404, { error: "房间不存在" });
      return;
    }

    if (req.method === "POST" && parts[3] === "join") {
      if (room.players.white) {
        sendJson(res, 409, { error: "房间已满" });
        return;
      }
      room.players.white = true;
      room.updatedAt = Date.now();
      sendJson(res, 200, { roomId, player: 2, seq: room.seq, game: room.game });
      return;
    }

    if (req.method === "GET" && parts.length === 3) {
      sendJson(res, 200, { roomId, seq: room.seq, game: room.game, players: room.players });
      return;
    }

    if (req.method === "POST" && parts[3] === "sync") {
      const body = await readJson(req);
      room.seq += 1;
      room.game = body.game;
      room.updatedAt = Date.now();
      sendJson(res, 200, { roomId, seq: room.seq, game: room.game });
      return;
    }
  }

  sendJson(res, 404, { error: "接口不存在" });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("request too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  do {
    id = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(id));
  return id;
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

server.listen(port, "0.0.0.0", () => {
  console.log("五子棋局域网服务已启动");
  console.log(`本机访问: http://localhost:${port}`);
  const addresses = getLanAddresses();
  if (addresses.length === 0) {
    console.log("没有检测到局域网 IPv4 地址，请确认设备已连接 Wi-Fi 或有线局域网。");
  }
  for (const address of addresses) {
    console.log(`局域网访问: http://${address}:${port}`);
  }
  console.log("如果其他设备打不开局域网地址，请允许 Node.js 通过 Windows 防火墙的专用网络。");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。可以关闭占用程序，或使用其他端口：set PORT=3001 && node server.js`);
  } else if (error.code === "EACCES") {
    console.error(`没有权限监听端口 ${port}。请换一个端口，例如：set PORT=3001 && node server.js`);
  } else {
    console.error("局域网服务启动失败：", error.message);
  }
  process.exit(1);
});
