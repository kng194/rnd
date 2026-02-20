import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import http from "http";
import { google } from "googleapis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("rnd_tasks.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    client_name TEXT,
    project_name TEXT,
    description TEXT,
    status TEXT DEFAULT 'To Do',
    priority TEXT DEFAULT 'Medium',
    category TEXT DEFAULT 'Produk',
    stage TEXT DEFAULT 'Inbox',
    assignee TEXT,
    deadline TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crew (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    photo TEXT,
    phone TEXT,
    address TEXT,
    join_date TEXT,
    performance INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Set default spreadsheet ID if not exists
const existingId = db.prepare("SELECT value FROM settings WHERE key = 'spreadsheet_id'").get();
if (!existingId) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('spreadsheet_id', '1xY78Q5eIcZ8fUFnPI1EO9TsPxuqP40GNetXpQ6wdPhg');
}

// Google Sheets Config
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL || 'http://localhost:3000'}/auth/google/callback`
);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;

  app.use(express.json());

  // Helper to get tokens from DB
  const getTokens = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'google_tokens'").get();
    return row ? JSON.parse((row as any).value) : null;
  };

  // Helper to sync to sheets
  const syncToSheets = async () => {
    const tokens = getTokens();
    const spreadsheetIdRow = db.prepare("SELECT value FROM settings WHERE key = 'spreadsheet_id'").get();
    const spreadsheetId = spreadsheetIdRow ? (spreadsheetIdRow as any).value : null;
    
    if (!tokens || !spreadsheetId) return;

    try {
      oauth2Client.setCredentials(tokens);
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      
      // Get the spreadsheet to find the first sheet name
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';

      const tasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
      const rows = [
        ['ID', 'Kode SPK/SPD', 'Klien', 'Proyek', 'Deskripsi', 'Status', 'Prioritas', 'Kategori', 'Stage', 'Penanggung Jawab', 'Deadline', 'Dibuat Pada'],
        ...tasks.map((t: any) => [
          t.id, t.title, t.client_name, t.project_name, t.description, t.status, t.priority, t.category, t.stage, t.assignee, t.deadline, t.created_at
        ])
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });

      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('last_sync', new Date().toISOString());
      io.emit('sync_status', { lastSync: new Date().toISOString() });
    } catch (err) {
      console.error('Failed to sync to Google Sheets', err);
    }
  };

  // Socket.io connection
  io.on("connection", (socket) => {
    console.log("Client connected");
  });

  // Helper to broadcast task updates
  const broadcastTasks = () => {
    const tasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
    const mappedTasks = tasks.map((t: any) => ({
      ...t,
      clientName: t.client_name,
      projectName: t.project_name
    }));
    io.emit("tasks_updated", mappedTasks);
    syncToSheets(); // Trigger sync on any update
  };

  // API Routes - Google Auth
  app.get('/api/auth/google/url', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/spreadsheets'],
      prompt: 'consent'
    });
    res.json({ url });
  });

  app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('google_tokens', JSON.stringify(tokens));
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Koneksi Google Sheets berhasil! Jendela ini akan tertutup otomatis.</p>
          </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send('Authentication failed');
    }
  });

  app.get('/api/settings/spreadsheet', (req, res) => {
    const spreadsheetId = db.prepare("SELECT value FROM settings WHERE key = 'spreadsheet_id'").get();
    const lastSync = db.prepare("SELECT value FROM settings WHERE key = 'last_sync'").get();
    const tokens = getTokens();
    
    res.json({
      spreadsheetId: spreadsheetId ? (spreadsheetId as any).value : '',
      lastSync: lastSync ? (lastSync as any).value : null,
      isConnected: !!tokens
    });
  });

  app.post('/api/settings/spreadsheet', (req, res) => {
    const { spreadsheetId } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('spreadsheet_id', spreadsheetId);
    syncToSheets();
    res.json({ success: true });
  });

  // SEED DATA
  app.post("/api/seed", (req, res) => {
    const crewCount = db.prepare("SELECT COUNT(*) as count FROM crew").get() as any;
    if (crewCount.count === 0) {
      const insertCrew = db.prepare("INSERT INTO crew (name, role, photo, phone, address, join_date, performance) VALUES (?, ?, ?, ?, ?, ?, ?)");
      insertCrew.run("Ahmad", "Designer Produk", "https://picsum.photos/seed/ahmad/200", "08123456789", "Bandung", "2018-01-15", 95); // Senior (> 5y)
      insertCrew.run("Budi", "Drafter", "https://picsum.photos/seed/budi/200", "08223456789", "Cimahi", "2022-05-20", 88); // Junior (1-5y)
      insertCrew.run("Siti", "Motif Artist", "https://picsum.photos/seed/siti/200", "08323456789", "Bandung", "2025-11-10", 92); // Pemula (< 1y)
      insertCrew.run("Agung", "Designer Produk", "https://picsum.photos/seed/agung/200", "08423456789", "Sumedang", "2015-03-12", 98); // Senior (> 5y)
      insertCrew.run("Dewi", "Drafter", "https://picsum.photos/seed/dewi/200", "08523456789", "Lembang", "2023-08-01", 85); // Junior (1-5y)
    }

    const clientCount = db.prepare("SELECT COUNT(*) as count FROM clients").get() as any;
    if (clientCount.count === 0) {
      const insertClient = db.prepare("INSERT INTO clients (name) VALUES (?)");
      insertClient.run("Kriya Nusantara");
      insertClient.run("G20 Indonesia");
      insertClient.run("Bank Mandiri");
      insertClient.run("PT Freeport");
    }

    const taskCount = db.prepare("SELECT COUNT(*) as count FROM tasks").get() as any;
    if (taskCount.count === 0) {
      const insertTask = db.prepare(
        "INSERT INTO tasks (title, client_name, project_name, description, status, priority, category, stage, assignee, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );
      
      // Inbox
      insertTask.run("SPK-2024-001", "Kriya Nusantara", "Plakat Logam", "Desain plakat untuk internal", "To Do", "Medium", "Produk", "Inbox", "Ahmad", "2024-03-01");
      insertTask.run("SPD-2024-002", "Bank Mandiri", "Souvenir Corporate", "Pembuatan motif batik mandiri", "To Do", "High", "Motif", "Inbox", "Siti", "2024-03-05");
      
      // Progres (Produk)
      insertTask.run("SPK-2024-003", "G20 Indonesia", "Trofi Utama", "Proses modeling 3D trofi", "In Progress", "Urgent", "Produk", "Desain", "Agung", "2024-02-28");
      insertTask.run("SPK-2024-004", "PT Freeport", "Miniatur Tambang", "Pengerjaan detail teknis", "In Progress", "High", "Produk", "Produksi", "Budi", "2024-03-10");
      
      // Progres (Motif)
      insertTask.run("SPK-2024-005", "Kriya Nusantara", "Wall Art", "Sketsa motif flora", "In Progress", "Medium", "Motif", "Sketsa", "Siti", "2024-03-15");
      
      // Finish
      insertTask.run("SPK-2023-099", "G20 Indonesia", "Cinderamata", "Selesai kirim", "Done", "Medium", "Produk", "Finish", "Ahmad", "2024-01-15");
    }

    broadcastTasks();
    res.json({ success: true, message: "Database seeded with example data" });
  });

  // API Routes - Tasks
  app.get("/api/tasks", (req, res) => {
    const tasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
    const mappedTasks = tasks.map((t: any) => ({
      ...t,
      clientName: t.client_name,
      projectName: t.project_name
    }));
    res.json(mappedTasks);
  });

  app.post("/api/tasks", (req, res) => {
    const { title, clientName, projectName, description, status, priority, category, stage, assignee, deadline } = req.body;
    const info = db.prepare(
      "INSERT INTO tasks (title, client_name, project_name, description, status, priority, category, stage, assignee, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(title, clientName, projectName, description, status || 'To Do', priority || 'Medium', category || 'Produk', stage || 'Inbox', assignee, deadline);
    
    broadcastTasks();
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/tasks/:id", (req, res) => {
    const { id } = req.params;
    const { title, clientName, projectName, description, status, priority, category, stage, assignee, deadline } = req.body;
    db.prepare(
      "UPDATE tasks SET title = ?, client_name = ?, project_name = ?, description = ?, status = ?, priority = ?, category = ?, stage = ?, assignee = ?, deadline = ? WHERE id = ?"
    ).run(title, clientName, projectName, description, status, priority, category, stage, assignee, deadline, id);
    
    broadcastTasks();
    res.json({ success: true });
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    
    broadcastTasks();
    res.json({ success: true });
  });

  // API Routes - Crew
  app.get("/api/crew", (req, res) => {
    const crew = db.prepare("SELECT * FROM crew ORDER BY name ASC").all();
    const mappedCrew = crew.map((c: any) => ({
      ...c,
      joinDate: c.join_date
    }));
    res.json(mappedCrew);
  });

  app.post("/api/crew", (req, res) => {
    const { name, role, photo, phone, address, joinDate, performance } = req.body;
    const info = db.prepare(
      "INSERT INTO crew (name, role, photo, phone, address, join_date, performance) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(name, role, photo, phone, address, joinDate, performance || 0);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/crew/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM crew WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // API Routes - Clients
  app.get("/api/clients", (req, res) => {
    const clients = db.prepare("SELECT * FROM clients ORDER BY name ASC").all();
    res.json(clients);
  });

  app.post("/api/clients", (req, res) => {
    const { name } = req.body;
    try {
      const info = db.prepare("INSERT INTO clients (name) VALUES (?)").run(name);
      res.json({ id: info.lastInsertRowid });
    } catch (err) {
      const existing = db.prepare("SELECT id FROM clients WHERE name = ?").get(name);
      if (existing) {
        res.json({ id: (existing as any).id });
      } else {
        res.status(500).json({ error: "Failed to create client" });
      }
    }
  });

  // EMAIL WEBHOOK AUTOMATION
  app.post("/api/webhooks/email", (req, res) => {
    const { from, subject, body } = req.body;

    // 1. Security check: Only from marketing@kriyanusantara.com
    if (from !== "marketing@kriyanusantara.com") {
      return res.status(403).json({ error: "Unauthorized sender" });
    }

    // 2. Check for SPK or SPD in subject or body
    const isSPK = subject.toUpperCase().includes("SPK") || body.toUpperCase().includes("SPK");
    const isSPD = subject.toUpperCase().includes("SPD") || body.toUpperCase().includes("SPD");

    if (!isSPK && !isSPD) {
      return res.status(400).json({ error: "Not an SPK/SPD email" });
    }

    // 3. Parse details from body using regex
    // Expected format in body:
    // Kode: SPK-XXX
    // Klien: Nama Klien
    // Proyek: Nama Proyek
    // Penanggung Jawab: Nama Crew
    // Deskripsi: ...
    
    const extract = (regex: RegExp) => {
      const match = body.match(regex);
      return match ? match[1].trim() : "";
    };

    const title = extract(/Kode:\s*(.*)/i) || (isSPK ? "SPK-NEW" : "SPD-NEW");
    const clientName = extract(/Klien:\s*(.*)/i) || "Unknown Client";
    const projectName = extract(/Proyek:\s*(.*)/i) || "New Project";
    const assigneeName = extract(/Penanggung Jawab:\s*(.*)/i);
    const description = extract(/Deskripsi:\s*([\s\S]*)/i) || body;

    // 4. Match assignee with existing crew
    let assignee = "";
    if (assigneeName) {
      const crewMember = db.prepare("SELECT name FROM crew WHERE name LIKE ?").get(`%${assigneeName}%`);
      if (crewMember) {
        assignee = (crewMember as any).name;
      }
    }

    // 5. Ensure client exists
    try {
      db.prepare("INSERT OR IGNORE INTO clients (name) VALUES (?)").run(clientName);
    } catch (e) {}

    // 6. Create Task
    const info = db.prepare(
      "INSERT INTO tasks (title, client_name, project_name, description, status, priority, category, stage, assignee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(title, clientName, projectName, description, 'To Do', 'High', 'Produk', 'Inbox', assignee);

    broadcastTasks();
    
    res.json({ 
      success: true, 
      taskId: info.lastInsertRowid,
      message: `Task created automatically from email: ${title}`
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
