# Bookshelf

A free reading tracker with personal book recommendations.

- Track what you've read, what you're reading, what you want to read and what you didn't finish (with where you stopped).
- A yearly reading goal on Home and a "Your year in books" recap page.
- "Next in your series" on Home picks up every series you've started.
- Share your shelf with a friend by link: they see your favorites they haven't read and a taste match score.
- Move your shelf to another device with a link, no account needed.
- Rate books (half stars allowed) and get a fit score (your predicted rating on a 0–100 scale) for every book in a hand-described catalog of about 1,500 titles.
- Import your Goodreads library (My Books → Import and export → Export library).
- Charts of your reading taste: genres, pace, length, narration, themes and more.
- Add it to your phone's home screen to use it like an app.

## Privacy

Everything you enter is saved in your own browser on your own device. Nothing is sent to a server, and nobody else can see your shelf. The only outside request is a search on Open Library (openlibrary.org) when you look up a book that isn't in the catalog. Use **Profile → Send to another device** or **Download backup** to move your shelf. Share and device links carry their data after the `#` in the link, which browsers never send to a server.

## Files

- `index.html` — the page and its styles
- `app.js` — the app
- `model.js` — themes, genres and the recommendation model
- `catalog.js` — the book catalog (generated; one row per book)
- `catalog-new.js` — books added by hand on top of the generated catalog (recent releases and missing series entries)
- `sw.js`, `manifest.webmanifest`, `icon-*.png` — offline support and home-screen install

## Updating

To add books or change anything, replace the files in this repository with new versions. Change the `VERSION` line in `sw.js` each time so phones pick up the update.
