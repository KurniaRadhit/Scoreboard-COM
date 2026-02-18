# 🚀 Clash of Minds — Deploy Guide

## Struktur Project

```
clash-of-minds/
├── server.js              # Backend Express + SQLite
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
└── public/
    ├── index.html         # Leaderboard publik  → /
    └── admin.html         # Admin panel         → /admin
```

---

## Cara Deploy ke VPS

### 1. Install Docker & Docker Compose di VPS

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verifikasi
docker --version
docker compose version
```

---

### 2. Upload project ke VPS

**Opsi A — via SCP:**
```bash
scp -r clash-of-minds/ user@IP_VPS:~/
```

**Opsi B — via Git:**
```bash
# Di VPS
git clone <repo-url> clash-of-minds
```

---

### 3. Jalankan

```bash
cd clash-of-minds

# Build & start (background)
docker compose up -d --build

# Cek status
docker compose ps

# Lihat logs
docker compose logs -f
```

Akses di browser:
- **Leaderboard** → `http://IP_VPS:7525/`
- **Admin Panel** → `http://IP_VPS:7525/admin`
- **Password admin** → `V3ncobolt!`

---

### 4. Ganti password admin (opsional)

Edit `docker-compose.yml`:
```yaml
environment:
  - ADMIN_PASSWORD=PASSWORD_BARU_KAMU
```
Lalu restart:
```bash
docker compose down && docker compose up -d --build
```

---

### 5. Perintah berguna

```bash
# Stop
docker compose down

# Restart
docker compose restart

# Lihat logs real-time
docker compose logs -f clash-of-minds

# Backup database
docker cp clash-of-minds:/app/data/clash.db ./backup-clash.db

# Update app (setelah edit file)
docker compose up -d --build
```

---

### 6. Setup Nginx reverse proxy (opsional, untuk domain)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:7525;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/clash-of-minds
# paste config di atas
sudo ln -s /etc/nginx/sites-available/clash-of-minds /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## API Endpoints

| Method | Path | Auth | Keterangan |
|--------|------|------|------------|
| GET | `/api/participants` | ❌ | Ambil semua peserta |
| POST | `/api/participants` | ✅ | Tambah peserta |
| PUT | `/api/participants/:id` | ✅ | Edit peserta |
| PATCH | `/api/participants/:id/score` | ✅ | Update skor |
| DELETE | `/api/participants/:id` | ✅ | Hapus peserta |
| POST | `/api/participants/import` | ✅ | Import CSV |
| POST | `/api/login` | ❌ | Login admin |
| POST | `/api/logout` | ✅ | Logout |
| POST | `/api/change-password` | ✅ | Ganti password |
