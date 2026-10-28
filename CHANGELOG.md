# Changelog

## 2026-10-28

### Added
- **Catalog app:** the real printed JCPenney and Sears catalogs for the year on the clock, as page scans from christmas.musetechnical.com.
  - The Library holds every book of the year on the clock, in order through the year (JCPenney before Sears). The book for the clock's quarter opens: Spring and Summer from January to June, Fall and Winter from July to September, Christmas from October to December. If the year has none for that quarter, the first book opens.
  - Two-page spread with a page-flip animation. Turn pages by clicking the sides, dragging, the arrow buttons or the arrow keys.
  - Pages sidebar with previews, a page-number box, and a **Library** with a count of the year's books.
  - Zoom (buttons, + and - keys, double-click, Ctrl or Cmd with the scroll wheel) and drag to look around.
  - True full screen (button or F key).
  - Loads two requests at a time and keeps every page and preview in the browser's cache, because the scan server drops connections under load. Your place in each catalog is remembered.
- **TV Guide app:** the printed TV listings, in the page-flipping viewer shared with the Catalog.
  - Opens the week on the clock as a recreated magazine, Saturday to Friday like the real one: a cover and four pages for each day (6 AM to noon, noon to 6, 6 to midnight, midnight to 6), a column for each of ABC, CBS, NBC, Fox, UPN and The WB, and the prime time hours in yellow. Lineups come from Wikipedia's schedule page for each TV season, the right show for the right month of the season.
  - The Library also holds the real weekly TV Guide issues that exist as scans on the Internet Archive: 11 regional issues from 1997 to 2002. An issue opens by itself when its week matches the clock.
- **Movie Night shelf:** the Movie Guide's Watchlist has a List / Shelf switch. The shelf shows your saved titles as poster boxes standing on wooden planks. Click boxes (up to four) to put them on tonight's bill: a ticket strip works out the start time of each feature, a 10 minute intermission, and when the lights come up. Choose when the doors open, let it pick a surprise double feature, copy the plan, or print the tickets.
- Mail window can be maximized with the green button.
- Read Me, Help and About text for the Catalog.

### Changed
- Catalog: pinch zoom on a trackpad is smooth, like any picture on a Mac, and no longer jumps between zoom levels. The page and zoom hint stays at the bottom of the screen when zoomed in full screen.
- The site is now called **Nostalgia Desktop** (it was Nostalgia Machine) and the repository is `nostalgia-desktop`.
- TV opens on the last channel you watched (channel 1 the first time).
- The news channel is now channel 1 and is called **News**. It stays on the news when a broadcast ends instead of moving on to another show.
- The Catalog's page viewer is now shared with the TV Guide. README: Catalog and TV Guide added, credits updated for the scans.

### Fixed
- Catalog full screen did nothing in Safari when the window was already in macOS full screen. If the browser refuses, the catalog now fills the page itself (Esc to leave).
- TV showed a YouTube premiere scheduled for the future on the news channel. Future uploads are now skipped, and cached search results from before the fix are ignored.
- TV now shows static, not the last frame, when a channel has nothing playing.
- The spoken "You've got mail" is never spoken from a background tab, at most once a minute, and is cancelled when the page is hidden or closed.
- README screenshots: the Old Web one was caught mid-load and is retaken; Movie Guide now shows a Movie Night double feature; all shots show the Catalog dock icon; added Catalog and start-up screen.
