# Facebook Comments Exporter

A small personal web app that lets you log in with Facebook, pick any Page you manage, and download all comments from a post as a two-column CSV file (Name, Comment).

Deployed on [fly.io](https://fly.io).

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Node.js ≥ 20 | Local development |
| [flyctl](https://fly.io/docs/hands-on/install-flyctl/) | Deploy to fly.io |
| A [Meta Developer account](https://developers.facebook.com/) | Facebook OAuth |

---

## 1 — Create the Facebook App

1. Go to **[developers.facebook.com](https://developers.facebook.com)** → **My Apps** → **Create App**.
2. Choose **Business** (or **Consumer**) type → give it a name → **Create App**.
3. From the App Dashboard, go to **Settings → Basic** and note your **App ID** and **App Secret**.
4. Add the **Facebook Login** product:
   - Left sidebar → **Add Product** → **Facebook Login** → **Set Up** (Web).
   - Under **Facebook Login → Settings**, add your redirect URI to **Valid OAuth Redirect URIs**:
     ```
     https://facebook-comments-app.fly.dev/auth/facebook/callback
     http://localhost:3000/auth/facebook/callback   ← for local dev
     ```
5. Under **App Review → Permissions and Features**, enable (request if needed):
   - `pages_show_list`
   - `pages_read_engagement`

   > For a **personal/development** app (you are the only user), these permissions work without going through App Review as long as your Facebook account is listed as a Developer or Tester of the app.

6. Keep the app in **Development** mode for personal use — you do **not** need to submit for App Review.

---

## 2 — Local development

```bash
# 1. Install dependencies
npm install

# 2. Create your .env from the template
cp .env.example .env
# Edit .env and fill in FB_APP_ID, FB_APP_SECRET, SESSION_SECRET
# Set FB_REDIRECT_URI=http://localhost:3000/auth/facebook/callback

# 3. Start the dev server (auto-restarts on file changes)
npm run dev
```

Open **http://localhost:3000** in your browser.

### Generate a SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3 — Deploy to fly.io

```bash
# First time only — creates the app on fly.io
fly launch --no-deploy

# Set secrets (never stored in fly.toml or the repo)
fly secrets set \
  FB_APP_ID=your_app_id \
  FB_APP_SECRET=your_app_secret \
  FB_REDIRECT_URI=https://facebook-comments-app.fly.dev/auth/facebook/callback \
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Deploy
fly deploy
```

After the first deploy, get your public URL with `fly status` and verify it matches the redirect URI you registered in the Meta Developer Portal.

---

## CSV output format

| Name | Comment |
|------|---------|
| Jane Doe | Great post! |
| John Smith | Thanks for sharing. |

- UTF-8 with BOM (opens correctly in Excel without encoding issues).
- All top-level comments and replies are included (uses the `stream` filter).
- Anonymous/deleted accounts appear as `Anonymous`.

---

## Architecture

```
GET  /                              → login / home page
GET  /auth/facebook                 → redirect to Facebook OAuth
GET  /auth/facebook/callback        → exchange code for token, store in session
GET  /logout                        → destroy session
GET  /pages                         → list pages you manage
GET  /pages/:pageId/posts           → list 20 most recent posts
GET  /export/:pageId/:postId        → stream CSV download (paginates Graph API)
```

Sessions are stored **in-memory** (no database required). Because fly.io can stop idle machines, you may need to log in again after a period of inactivity. This is expected behavior for a personal tool.

---

## Security notes

- `FB_APP_SECRET` and `SESSION_SECRET` are stored exclusively as fly.io secrets and are never logged or committed.
- All cookies are `HttpOnly`, `SameSite=lax`, and `Secure` in production.
- The app runs as a non-root user inside the container.
- `helmet` sets strict HTTP security headers on every response.
