# The Wall

**A quiet, responsive space to share moments and stay connected.**

The Wall is a social feed built with HTML, CSS, and JavaScript. It uses Supabase for accounts, posts, follows, comments, notifications, and image storage.

**Live site:** [matthewidk-ship-it.github.io/The-Wall](https://matthewidk-ship-it.github.io/The-Wall/)

## Features

- Responsive social feed with search, comments, reactions, saved posts, and followed posts
- Email/password sign-up and login, email confirmation, and password recovery through Supabase Auth
- Custom usernames with case-insensitive, unique handles
- Notifications for follows, posts, comments, and `@mentions`
- Image and text stories that expire after 24 hours
- Trending hashtags and counts from recent posts
- Profile photos and custom profile banners
- Post image uploads (JPEG, PNG, WebP, or GIF; up to 10 MB)
- Romanian, English, Spanish, French, German, Italian, Portuguese, and Japanese
- Light, dark, and system appearance options
- Full-screen settings with a blurred backdrop

## Run locally

Open `index.html` in a browser or serve the project folder with a static web server. An internet connection is required to load Supabase JS from jsDelivr.

Without Supabase configuration, the app displays sample posts. Account-dependent actions show a setup message, and sign-up and login are unavailable.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
   - If you already have an earlier schema, run these migrations in order:
     [`20261020_stories.sql`](./supabase/migrations/20261020_stories.sql),
     [`20261020_usernames.sql`](./supabase/migrations/20261020_usernames.sql), and
     [`20261101_profile_banners.sql`](./supabase/migrations/20261101_profile_banners.sql).
3. Add your Supabase Project URL and **publishable key** (or legacy `anon` key) to [`config.js`](./config.js):

   ```js
   window.THE_WALL_CONFIG = {
     supabaseUrl: "https://YOUR_PROJECT.supabase.co",
     supabaseAnonKey: "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY"
   };
   ```

   The publishable/anon key is intended for browser use and is protected by the database's Row Level Security policies. **Never put the `service_role` key in `config.js` or any other client-side file.**

4. In Supabase **Authentication → URL Configuration**, set the deployed site URL and add the exact site URL to the redirect allow list. For GitHub Pages, use `https://YOUR_NAME.github.io/The-Wall/`. Add your local preview URL too if you test password recovery locally.
5. Configure a verified email provider under **Authentication → SMTP Settings**. Test the confirmation and password-reset emails; Supabase's default email service is rate-limited and is not suitable for production.
6. Publish the project as a static site, for example with GitHub Pages. Password recovery redirects to the current page, so make sure that URL is allowed in Supabase.

## Before using real accounts

This project does not have access to your Supabase project or email provider. Sign-in, sign-up, email confirmation, password recovery, and social features require the setup above. Review the database policies and configure production-grade email delivery before using real user data.
