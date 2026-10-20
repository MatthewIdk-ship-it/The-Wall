# The Wall

The Wall is a responsive social feed built with HTML, CSS, and JavaScript. It uses Supabase for real accounts, posts, follows, comments, notifications, and image storage.

## Local preview

Open `index.html` in a browser or serve this directory with a local static web server. The app loads Supabase JS from jsDelivr, so an internet connection is needed. Until Supabase is configured, sample posts are shown and account-dependent actions display a setup message; login and sign-up do not work in demo mode.

## Configure Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql). It creates the tables, row-level security policies, notification triggers, image bucket, and Realtime publication entry used by the app.
   If your project already has the previous schema, run [`supabase/migrations/20261020_stories.sql`](./supabase/migrations/20261020_stories.sql) in the SQL Editor to add story storage and policies without recreating existing tables.
3. Copy the project's **Project URL** and **publishable key** (or legacy `anon` key) into [`config.js`](./config.js):

   ```js
   window.THE_WALL_CONFIG = {
     supabaseUrl: "https://YOUR_PROJECT.supabase.co",
     supabaseAnonKey: "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY"
   };
   ```

   The publishable/anon key is intended for browser use and is protected by the schema's RLS policies. **Never put the `service_role` key in `config.js` or any client-side file.**

4. In Supabase **Authentication → URL Configuration**, set the deployed site URL and add the exact deployed page URL to the redirect allow list. For a GitHub Pages project site, that is typically `https://YOUR_NAME.github.io/The-Wall/`; add your local preview URL too if you will test password recovery locally.
5. Configure email delivery in Supabase **Authentication → SMTP Settings** with an email provider you control. Set up the provider's sender/domain verification and test the confirmation and password-reset templates. Supabase's default email service is rate-limited and is not suitable for production.
6. Publish the folder as a static site, for example with GitHub Pages. The password-reset redirect returns to the current page, so allow that page's URL in the Supabase redirect settings.

The app does not have access to your Supabase project or mail provider. Real sign-in, sign-up, email confirmation, password recovery, and social features remain unavailable until you complete these steps. Do not use real user data until you have reviewed the database policies and configured production-grade email delivery.

## Features

- Responsive feed, search, comments, reactions, saved posts, follows, and a followed-posts feed
- Email/password account flows managed by Supabase Auth, including email confirmation and password reset
- Social notifications for new followers, followed-user posts, comments, and `@mentions`
- Image/text stories that expire after 24 hours, and trending hashtags/counts calculated from recent posts
- Full-screen blurred settings for account details, profile photos, appearance, and language
- JPEG, PNG, WebP, and GIF post image uploads up to 10 MB
- Romanian, English, Spanish, French, German, Italian, Portuguese, and Japanese interface translations; system language is selected by default
- Light, dark, and system appearance options in a monochrome palette
