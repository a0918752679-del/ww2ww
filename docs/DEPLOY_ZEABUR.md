# Zeabur 部署步驟

## 1. 上傳 GitHub

```bash
git init
git add .
git commit -m "wanwan beyblade kuji v6"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## 2. Zeabur 建立服務

- New Project
- Add Service
- GitHub
- 選擇 Repository
- Framework：Node.js
- Build Command：`npm install`
- Start Command：`npm start`

## 3. 設定環境變數

請至少設定：

```env
PORT=8080
BASE_URL=https://your-service.zeabur.app
ADMIN_PASSWORD=69677323
JWT_SECRET=請改長隨機字串
BANK_ACCOUNT=銀行代碼 / 帳號 / 戶名
```

## 4. 部署後確認

```text
/health
```

回傳：

```json
{"ok":true}
```

## 5. 前後台網址

```text
https://your-service.zeabur.app/
https://your-service.zeabur.app/admin
```
