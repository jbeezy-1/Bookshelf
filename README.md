# Bookshelf

A free reading tracker with personal book recommendations.

- Track what you've read, what you're reading, what you want to read and what you didn't finish (with where you stopped).
- Book covers from Open Library, with a generated cover when there isn't one. Covers can be turned off in Profile.
- A page for every book: cover, details, "most like this", the rest of its series, more by the author, what saved friends thought, and links to find it at a library (Libby, WorldCat) or buy it (Bookshop.org). Each book page has its own shareable link.
- Search from anywhere (press /), a bottom tab bar on phones, a cover-grid view, star ratings, light/dark/auto appearance.
- Discover moods ("Can't put it down", "Short enough for a flight", "A love story"…), "Because you loved…" rows on Home, and lists that skip repeats of the same author or series and start series at book 1.
- Log reading by page number with quick +10/+25/+50 buttons, a reading-days calendar with streaks, and a series tracker.
- Goodreads import also brings read counts, date added, reviews (as notes) and a favorites shelf; near-miss titles are offered as "Did you mean…?" on the Clean up page, which also catches missing dates, ratings and formats.
- Track the format you read in (print, ebook, audiobook); Goodreads imports bring it over.
- A yearly reading goal on Home, a "Your year in books" recap page, and a Wrapped-style story of your year with a shareable summary image.
- Quick-rate: new readers rate well-known books in a minute to get personal recommendations right away.
- "Next in your series" on Home picks up every series you've started.
- Share your shelf with a friend by link: they see your favorites they haven't read and a taste match score.
- Move your shelf to another device with a link, no account needed.
- Every genre, including romance and young adult. Rate books (half stars allowed) and get a fit score (your predicted rating on a 0–100 scale) for every book. Rare shared themes count more than common ones, authors you've rated pull their other books up or down, award winners get a small lift, and after 15 ratings the weights tune themselves to each reader in a hand-described catalog of about 1,500 titles.
- Import your Goodreads library (My Books → Import and export → Export library).
- Charts of your reading taste: genres, pace, length, narration, themes and more.
- Add it to your phone's home screen to use it like an app.

## Privacy

Everything you enter is saved in your own browser on your own device. Nothing is sent to a server, and nobody else can see your shelf. The only outside requests go to Open Library (openlibrary.org): cover images, which send just a book's title and author and can be turned off in Profile, and searches when you look up a book that isn't in the catalog. Use **Profile → Send to another device** or **Download backup** to move your shelf. Share and device links carry their data after the `#` in the link, which browsers never send to a server.

## Files

- `index.html` — the page and its styles
- `app.js` — the app
- `model.js` — themes, genres and the recommendation model
- `catalog.js` — the book catalog (generated; one row per book)
- `catalog-tags.js` — extra themes for books in `catalog.js` (every book now has at least four)
- `catalog-blurbs.js` — the longer, spoiler-free 2–3 sentence description for every catalog book, shown on its page and when you expand it in a list (the one-line hook stays in the catalog rows). Books added in the editor can carry their own description instead.
- `editor.html` — catalog editor for the site owner: fill in a book, download the updated `catalog-new.js`, upload it
- `catalog-new.js` — books added by hand on top of the generated catalog (recent releases and missing series entries)
- `sw.js`, `manifest.webmanifest`, `icon-*.png` — offline support and home-screen install

## Updating

To add books or change anything, replace the files in this repository with new versions. Change the `VERSION` line in `sw.js` each time so phones pick up the update.
