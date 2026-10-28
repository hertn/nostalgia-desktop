# Changelog

## 2026-10-28

### Added
- **Gallery** (`gallery.html`): the screenshots as a thumbnail grid that opens in a lightbox, with arrow keys and swipe, linked from the README.
- Restart now boots straight back up instead of stopping at the power button; Movie Night's "Add both to watchlist" confirms the add.
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
- **TV now has ten channels**, each with its own pool of recordings, instead of 69 random shows that mostly weren't in the Archive (which sent many channels to the same leftover tape): 1 News, 2 Saturday morning cartoons, 3 Commercials, 4 Kids TV, 5 Toon Block, 6 Sitcoms, 7 Dramas, 8 Late Night, 9 Music TV, 10 Sports and Movies. A channel uses the clock's year, then the years either side, then any year of 1996 to 2005. The number keys tune at once (1 to 9, and 0 is channel 10). The news and commercials channels start over with something new when they end. A recording that won't play rules out its whole item, not just that file. YouTube is no longer used by the TV, except for the news and commercial channels as a last resort.
- **TV channel buttons** are now left and right arrows (left goes down a channel, right goes up), in that order. The left and right arrow keys work too, as do up and down.
- **TV: far fewer channels that "can't find anything".** About a third of the recordings it picked were files that can't start quickly (the uploader's own MP4 with its index at the end, sometimes not even H.264), so the TV skipped them one after another. It now uses only the Archive's own streaming copies (small 512 kbps copy first), remembers files that fail so they are never picked again, and when nothing on a channel starts it chooses again once before giving up.
- **TV channel number on the screen:** the number now shows in green on the picture, as on a real set (also while you type digits), and the display is gone from the control strip.
- **TV is much faster.** The recording for each channel is settled once per clock date and remembered, so tuning back finds the same thing and the next visit needs no searching. While you watch, the TV also prepares the picks for the channels around yours, and loads the channels either side so channel up and down switch at once (about a tenth of a second instead of 1 to 3 seconds). Jumping to a channel that isn't loaded takes about as long as the Archive takes to send the first bytes. Commercial breaks load the next spot while one plays, so there are no gaps. Recordings are fetched straight from the Archive's data server, skipping a redirect.
- **TV restyled as a silver CRT set** (after a real one): perforated speaker panels in the casing either side of a raised bezel, the TIMETRON label under the glass, and a dark control strip beneath with the power button, channel display, channel and volume buttons and the number keys. The keypad no longer sits in a side panel.
- **TV maximized:** the picture keeps its 4:3 shape (it used to stretch wide) and perforated speaker panels sit in the casing on either side of the glass, like a real set.
- **TV full screen:** press F (or Channel > Full Screen) for just the 4:3 picture on black; Esc leaves. Number keys and the arrows still change channels.
- **TV number keys:** type a channel on the keyboard (one digit from 7 to 9, or two digits; a 1 to 6 waits a moment for the second) or click the new keypad on the set. Enter jumps at once. The speaker grille made room for the keypad.
- TV with Archive recordings keeps the static up until the picture is really playing, and jumps into the middle of a show before it starts instead of after, so there is no black screen in between. A recording that doesn't start in 8 seconds is skipped.
- **TV now looks in the Internet Archive first.** Commercial breaks are a run of real spots from the year on the clock, the news channel finds a broadcast from the day, month or year (nothing from after 11 September 2001), cartoons and shows come from recorded broadcasts and tapes where they exist. A show the Archive doesn't carry tunes to a real off-air recording from the year on the clock instead, so channels don't go dark, and YouTube is the last fallback. No channel plays September 2001 attack coverage. Needs a browser that plays H.264 video (Safari and Chrome do).
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
