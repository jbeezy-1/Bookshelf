# Bookshelf

A free reading tracker with personal book recommendations.

- Track what you've read, what you're reading and what you want to read.
- Rate books (half stars allowed) and get a fit score for every book in a hand-described catalog of about 1,500 titles.
- Import your Goodreads library (My Books → Import and export → Export library).
- Charts of your reading taste: genres, pace, length, narration, themes and more.
- Add it to your phone's home screen to use it like an app.

## Privacy

Everything you enter is saved in your own browser on your own device. Nothing is sent to a server, and nobody else can see your shelf. The only outside request is a search on Open Library (openlibrary.org) when you look up a book that isn't in the catalog. Use **Profile → Download backup** to move your shelf to another device.

## Files

- `index.html` — the page and its styles
- `app.js` — the app
- `model.js` — themes, genres and the recommendation model
- `catalog.js` — the book catalog (generated; one row per book)
- `sw.js`, `manifest.webmanifest`, `icon-*.png` — offline support and home-screen install

## Updating

To add books or change anything, replace the files in this repository with new versions. Change the `VERSION` line in `sw.js` each time so phones pick up the update.
