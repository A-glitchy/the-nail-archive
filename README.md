# THE NAIL ARCHIVE

A minimal, mobile-friendly nail inspiration gallery and manicure diary.

## Included
- Inspiration gallery with All and Wishlist views
- Seasonal filters: Spring, Summer, Autumn, Winter
- Built-in photo cropper, zoom, and rotate editor before upload
- Automatic side-by-side Collage + Original Photos Slideshow when uploading 2+ photos or mixing two saved designs
- Full-screen tap-to-zoom lightbox viewer for showing designs to your nail tech
- Manicure diary with finished nail photos, inspiration linking, date, start/finish time, price, and season
- Email/password accounts and private Supabase storage protected by Row Level Security

## 1. Create or update the private database
1. Open your project at https://supabase.com/dashboard.
2. Open **SQL Editor**, create a query, paste all of `supabase/schema.sql`, and run it. (It safely works for both fresh projects and updating existing tables.)
3. Open **Project Settings → API** (or **Connect**) and copy the Project URL and publishable/anon key.
4. Open `config.js` and replace the two `ADD_...` placeholders. Use only the publishable/anon key. **Never put a service_role or secret key in frontend code.**

## 2. Publish the app with GitHub Pages
1. Upload the files inside `the-nail-archive/` to the root of your repository.
2. In GitHub, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select branch `main` and folder `/(root)`, then Save.

## 3. Allow your website in Supabase
In Supabase **Authentication → URL Configuration**, add your GitHub Pages URL as the Site URL and an allowed Redirect URL.
