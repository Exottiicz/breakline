# Launching Breakline for free

## 1. Get it online

1. Make free accounts at GitHub, Cloudflare, and Supabase.
2. Make a new GitHub repository called `breakline` and upload everything in this folder.
3. In Cloudflare, choose **Workers & Pages → Create → Pages → Import Git repository**.
4. Select the repository. Set framework preset to **None**, build command to `exit 0`, and build output directory to `outputs`.
5. Deploy. Cloudflare gives you a free `*.pages.dev` public address.

## 2. Turn on real accounts and shared builds

1. Create a new free Supabase project.
2. Run the entire `supabase-setup.sql` file in **SQL Editor**.
3. In **Authentication → Providers**, leave Email enabled. Set the Site URL to your `*.pages.dev` address.
4. From **Project Settings → API**, copy the Project URL and the **anon** public key into `config.js`.
5. Upload the changed `config.js` to GitHub. Cloudflare republishes automatically.

Until Supabase is connected, the site works as a private demo using only this browser's local storage.
