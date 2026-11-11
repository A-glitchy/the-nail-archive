# THE NAIL ARCHIVE

A minimal, mobile-friendly nail inspiration gallery and manicure diary.

## Included
- One inspiration gallery with All and Wishlist views
- Seasonal filters: Spring, Summer, Autumn, Winter
- Multiple photos per design (select many at once)
- Wishlist / Tried status
- Manicure diary: design, date, start/finish time, price and season
- Email/password accounts
- Private photo storage and database rows protected by Supabase Row Level Security

## 1. Create the private database
1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor**, create a query, paste all of `supabase/schema.sql`, and run it.
3. Open **Project Settings → API** (or **Connect**) and copy the Project URL and publishable/anon key.
4. Open `config.js` and replace the two `ADD_...` placeholders. Use only the publishable/anon key. **Never put a service_role or secret key in frontend code.**

## 2. Publish the app with GitHub Pages
1. Upload the contents of this ZIP to the root of your repository (not the ZIP file itself).
2. In GitHub, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select branch `main` and folder `/(root)`, then Save.
4. Your site address will be `https://a-glitchy.github.io/the-nail-archive/`.

## 3. Allow your website in Supabase
In Supabase **Authentication → URL Configuration**, add your GitHub Pages URL as the Site URL and an allowed Redirect URL.

## Privacy
The website code is public because GitHub Pages serves it publicly. Your nail records and images are not stored in GitHub. They are stored in your private Supabase project. Database access is limited to the signed-in account that owns each row, and the image bucket is private. The browser key in `config.js` is the public client key; the SQL policies provide the access boundary.

## Current MVP limitations
This is the first usable version. Editing/deleting entries, a diary photo attachment, image backup/export and pairing an inspiration image with its real-life manicure are not included yet. Keep a separate backup of important photos.
