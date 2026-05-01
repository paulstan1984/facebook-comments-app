'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const axios = require('axios');
const { stringify } = require('csv-stringify/sync');
const path = require('path');

// ─── Config validation ────────────────────────────────────────────────────────

const REQUIRED_ENV = ['FB_APP_ID', 'FB_APP_SECRET', 'FB_REDIRECT_URI', 'SESSION_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const FB_APP_ID      = process.env.FB_APP_ID;
const FB_APP_SECRET  = process.env.FB_APP_SECRET;
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;
const FB_API_VERSION = 'v22.0';
const GRAPH_BASE     = `https://graph.facebook.com/${FB_API_VERSION}`;
const PORT           = parseInt(process.env.PORT || '3000', 10);
const IS_PROD        = process.env.NODE_ENV === 'production';

// ─── App setup ────────────────────────────────────────────────────────────────

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // Required behind fly.io's proxy

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'https:', 'data:'],
      scriptSrc:  ["'self'"],
    },
  },
}));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   IS_PROD,
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   24 * 60 * 60 * 1000, // 24 hours
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Performs a GET request to the Facebook Graph API.
 * If `url` is already a full URL (e.g. a pagination `next` link), it is used
 * as-is; otherwise it is resolved relative to GRAPH_BASE.
 */
const fbGet = (url, params) =>
  axios.get(url.startsWith('http') ? url : `${GRAPH_BASE}/${url}`, {
    params,
    timeout: 15_000,
  });

const requireAuth = (req, res, next) => {
  if (!req.session.accessToken) return res.redirect('/');
  next();
};

const FB_ERROR_MESSAGES = {
  session_expired: 'Your session has expired. Please log in again.',
  auth_failed:     'Authentication failed. Please try again.',
  api_error:       'A Facebook API error occurred. Please try again.',
  invalid_post:    'Invalid post reference.',
};

/**
 * Fetches every comment on a post, following cursor pagination.
 * Returns an array of { Name, Comment } objects ready for CSV serialization.
 */
const getAllComments = async (postId, pageToken) => {
  const comments = [];

  // First request uses explicit params; subsequent requests follow `next` URLs
  // that Facebook returns with all params already embedded.
  let url    = `${GRAPH_BASE}/${postId}/comments`;
  let params = {
    access_token: pageToken,
    fields: 'from{name},message',
    filter: 'stream', // includes all comments, not just top-level
    limit:  100,
  };

  while (url) {
    const response = await fbGet(url, params);

    for (const comment of response.data.data || []) {
      comments.push({
        Name:    comment.from?.name || 'Anonymous',
        Comment: comment.message   || '',
      });
    }

    url    = response.data.paging?.next || null;
    params = null; // next URL already contains access_token and all params
  }

  return comments;
};

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const error = FB_ERROR_MESSAGES[req.query.error] || null;
  res.render('index', {
    isLoggedIn: !!req.session.accessToken,
    userName:   req.session.userName || null,
    error,
  });
});

// Kick off the Facebook OAuth flow
app.get('/auth/facebook', (req, res) => {
  const params = new URLSearchParams({
    client_id:     FB_APP_ID,
    redirect_uri:  FB_REDIRECT_URI,
    scope:         'pages_show_list,pages_read_engagement',
    response_type: 'code',
  });
  res.redirect(`https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?${params}`);
});

// Facebook redirects here after the user grants (or denies) access
app.get('/auth/facebook/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    console.error('[auth] OAuth error:', error);
    return res.redirect('/?error=auth_failed');
  }

  try {
    // 1. Exchange the authorization code for a short-lived token
    const tokenRes = await fbGet(`${GRAPH_BASE}/oauth/access_token`, {
      client_id:     FB_APP_ID,
      client_secret: FB_APP_SECRET,
      redirect_uri:  FB_REDIRECT_URI,
      code,
    });

    // 2. Upgrade to a long-lived token (~60 days)
    const longRes = await fbGet(`${GRAPH_BASE}/oauth/access_token`, {
      grant_type:       'fb_exchange_token',
      client_id:        FB_APP_ID,
      client_secret:    FB_APP_SECRET,
      fb_exchange_token: tokenRes.data.access_token,
    });

    const accessToken = longRes.data.access_token;

    // 3. Fetch basic user info to display in the UI
    const userRes = await fbGet(`${GRAPH_BASE}/me`, {
      access_token: accessToken,
      fields: 'id,name',
    });

    req.session.accessToken = accessToken;
    req.session.userName    = userRes.data.name;

    res.redirect('/pages');
  } catch (err) {
    const fbErr = err.response?.data?.error;
    console.error('[auth] callback error:', fbErr || err.message);
    res.redirect('/?error=auth_failed');
  }
});

// Destroy session and redirect home
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// List all Facebook Pages the logged-in user administers
app.get('/pages', requireAuth, async (req, res) => {
  try {
    const response = await fbGet(`${GRAPH_BASE}/me/accounts`, {
      access_token: req.session.accessToken,
      fields: 'id,name,picture{url}',
      limit: 100,
    });

    res.render('pages', {
      pages:    response.data.data || [],
      userName: req.session.userName,
      error:    req.query.error ? FB_ERROR_MESSAGES.api_error : null,
    });
  } catch (err) {
    const fbErr = err.response?.data?.error;
    console.error('[pages]', fbErr || err.message);
    const dest = fbErr?.code === 190 ? '/?error=session_expired' : '/?error=api_error';
    res.redirect(dest);
  }
});

// List the 20 most recent posts for a given Page
app.get('/pages/:pageId/posts', requireAuth, async (req, res) => {
  const { pageId } = req.params;

  try {
    // Retrieve the Page-scoped access token via /me/accounts (more reliable than
    // fetching the page object directly, which fails for New Page Experience pages)
    const accountsRes = await fbGet(`${GRAPH_BASE}/me/accounts`, {
      access_token: req.session.accessToken,
      fields: 'id,name,access_token',
      limit: 100,
    });

    const page = (accountsRes.data.data || []).find(p => p.id === pageId);
    if (!page) {
      return res.redirect('/pages?error=api_error');
    }

    const pageToken = page.access_token;
    const pageName  = page.name;

    const postsRes = await fbGet(`${GRAPH_BASE}/${pageId}/posts`, {
      access_token: pageToken,
      fields: 'id,message,story,created_time',
      limit: 20,
    });

    res.render('posts', {
      posts:    postsRes.data.data || [],
      pageId,
      pageName,
      userName: req.session.userName,
      error:    req.query.error ? FB_ERROR_MESSAGES[req.query.error] || FB_ERROR_MESSAGES.api_error : null,
    });
  } catch (err) {
    const fbErr = err.response?.data?.error;
    console.error('[posts]', fbErr || err.message);
    const dest = fbErr?.code === 190 ? '/?error=session_expired' : '/pages?error=api_error';
    res.redirect(dest);
  }
});

// Stream all comments for a post as a UTF-8 CSV download
app.get('/export/:pageId/:postId', requireAuth, async (req, res) => {
  const { pageId, postId } = req.params;

  // Facebook page post IDs are always in the format {pageId}_{postId}
  if (!postId.startsWith(`${pageId}_`)) {
    return res.redirect(`/pages/${pageId}/posts?error=invalid_post`);
  }

  try {
    // Re-fetch the page token so the export works even after a session reload
    const pageRes = await fbGet(`${GRAPH_BASE}/${pageId}`, {
      fields: 'access_token',
      access_token: req.session.accessToken,
    });

    const pageToken = pageRes.data.access_token;
    const comments  = await getAllComments(postId, pageToken);

    // BOM prefix makes Excel open UTF-8 CSVs correctly without garbling characters
    const csv = '\uFEFF' + stringify(comments, {
      header:  true,
      columns: ['Name', 'Comment'],
    });

    const filename = `comments-${postId}-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    const fbErr = err.response?.data?.error;
    console.error('[export]', fbErr || err.message);
    const dest = fbErr?.code === 190
      ? '/?error=session_expired'
      : `/pages/${pageId}/posts?error=api_error`;
    res.redirect(dest);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} [${IS_PROD ? 'production' : 'development'}]`);
});
