import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

// Support both ESM and CJS for __dirname
// @ts-ignore
const isESM = typeof import.meta !== 'undefined' && import.meta.url;
const __dirname = isESM 
  ? path.dirname(fileURLToPath(import.meta.url)) 
  : (globalThis as any).__dirname || '.';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Collaboration Logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on("case-update", ({ roomId, patientCase }) => {
      // Broadcast to others in the room
      socket.to(roomId).emit("remote-case-update", patientCase);
    });

    socket.on("cursor-move", ({ roomId, userId, position }) => {
      socket.to(roomId).emit("remote-cursor-move", { userId, position });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Express 5 requires named parameters for wildcards
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
