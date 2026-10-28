# Changelog

## 2026-10-28

### Added
- **Catalog app:** the real printed JCPenney and Sears catalogs for the year on the clock, as page scans from christmas.musetechnical.com.
  - Opens the book that fits the date: Christmas Wish Book in November and December, Fall and Winter from August, Spring and Summer otherwise.
  - Two-page spread with a page-flip animation. Turn pages by clicking the sides, dragging, the arrow buttons or the arrow keys.
  - Pages sidebar with previews, a page-number box, and a **Library** of every catalog from that year.
  - Zoom (buttons, + and - keys, double-click, Ctrl or Cmd with the scroll wheel) and drag to look around.
  - True full screen (button or F key).
  - Loads two requests at a time and keeps every page and preview in the browser's cache, because the scan server drops connections under load. Your place in each catalog is remembered.
- Mail window can be maximized with the green button.
- Read Me, Help and About text for the Catalog.

### Changed
- The site is now called **Nostalgia Desktop** (it was Nostalgia Machine) and the repository is `nostalgia-desktop`.
- TV opens on the last channel you watched (channel 1 the first time).
- The news channel is now channel 1 and is called **News**. It stays on the news when a broadcast ends instead of moving on to another show.
- README: Catalog added, credits updated for the scans.

### Fixed
- TV showed a YouTube premiere scheduled for the future on the news channel. Future uploads are now skipped, and cached search results from before the fix are ignored.
- TV now shows static, not the last frame, when a channel has nothing playing.
- The spoken "You've got mail" is never spoken from a background tab, at most once a minute, and is cancelled when the page is hidden or closed.
- README screenshots: the Old Web one was caught mid-load and is retaken; Movie Guide now shows a Movie Night double feature; all shots show the Catalog dock icon; added Catalog and start-up screen.
