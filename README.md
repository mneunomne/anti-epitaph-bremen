# anti-epigraph — bremen

Two pages, no build step, no dependencies to install.

- **[index.html](index.html)** — the piece. One pallet of brick laid flat, the fazenda
  painting inscribed across its top course and broken by scraps of the Bremen
  paperwork. Drag to rotate, click a brick to pull it out — whatever was under
  it surfaces carrying its own fragment.
- **[engrave.html](engrave.html)** — the engraving desk. Turns a picture into one laser file
  per brick, and keeps the record of what has actually been cut.

## Running it

```
python3 -m http.server 8000
```

then open `http://localhost:8000/`. A plain `file://` open works for the desk
too, except for the three bundled source images — the browser will not read a
sibling file from `file://`, so use *choose an image…* instead.

The piece pulls three.js from a CDN, so it needs a connection the first time.
The desk needs nothing.

## Layout

```
index.html            the piece
engrave.html          the engraving desk
css/
  piece.css
  dashboard.css
js/
  piece.js            the three.js scene
  lib/
    zip.js            store-mode zip writer (~120 lines, no dependency)
    idb.js            indexeddb wrapper — projects live here
  engrave/
    tiling.js         millimetre maths: brick → face → wall → source crop
    imaging.js        crop, levels, dither, the clay simulation
    gcode.js          the bitmap as machine moves, run-length encoded
    export.js         svg emit, manifest, README, zip assembly
    state.js          the project model and its record
    ui.js             the desk
images/               the three sources the piece uses
```

## The desk

**Brick** — pick a format (NF, DF, 2DF, RF, klinker) or type your own, then
choose which face gets engraved: stretcher (long side), header (short end) or
bed (top). Everything downstream is in millimetres.

**Wall** — bricks across × courses, plus the mortar joint. *fit courses to the
image* solves for the number of courses that carries the picture undistorted;
the footer shows the residual distortion if you override it. Course R01 is the
bottom course by default — the one you lay first.

**Source** — drop an image, pick one, or use one of the three bundled files.

**Laser** — resolution, then grayscale / Floyd–Steinberg dither / hard
threshold, with brightness, contrast, gamma and invert. *what burns* shows
exactly the bitmap the head will trace, so there are no surprises. Bleed
engraves past the brick edge so a slightly misplaced blank still lands covered.

The footer warns when the source cannot actually resolve the requested dpi at
wall size — a 990 px scan blown up to 1.5 m resolves about 16 dpi, and asking
for 254 buys nothing but file size.

**Machine** — speed, power, and how the head is driven, for the `.gc` the desk
writes per brick. Power is a percentage of `$30` (S1000 on most GRBL boards),
so 10% is the `S100` a Longer controller expects. The origin is where the
bottom-left of the engraved area lands on the bed — the jig corner, not the
brick corner, since bleed extends past the brick.

*M3* holds the commanded power through acceleration, so the head must already
be at speed when it meets the first lit pixel; give it the overscan the panel
asks for, or the leading edge of every row burns deeper than the rest. *M4*
scales power with velocity and needs none.

A raster `.gc` is one move per change of power, so it is big — about 9 MB for
one NF stretcher at 254 dpi, near a gigabyte for a wall. Cut in batches with
the scope selector, or untick *gcode* and send the SVGs instead.

**Simulation** — the wall as fired clay. Switch the burn between *darker*
(soot) and *lighter* (cut back to the body) to match your material. Test one
brick before committing to a wall.

### The record

Click a brick, or a ledger row, and set its status: pending, queued, engraved,
failed, skipped — with a date, operator, passes/power and notes. Keys `e q f s
p` do the same with a brick selected; arrows move between bricks. Double-click
a brick on the wall to flip it straight to engraved.

The *status* view colours the whole wall by where each brick stands. The ledger
underneath is the spreadsheet this replaces, filterable and exportable to CSV.

Everything saves itself to IndexedDB as you work. Several projects can live
side by side. *save project as .json* writes settings, record and source image
into one file you can back up or move to another machine.

### What the zip contains

```
<wall>/png/R01C01.png      the bitmap, one per brick, at the chosen dpi
<wall>/svg/R01C01.svg      the same bitmap at true mm size, with a red
                           outline rect on the brick edge — import this and
                           do not resize it
<wall>/gcode/R01C01.gc    the same bitmap as moves, ready to send. absolute
                           coordinates from the origin you set; it does not
                           home. the header states the rectangle it will
                           touch — frame that before the first one
<wall>/layout.svg          the whole wall at true size, labelled, coloured
                           by status: the build sheet
<wall>/simulation.png      what the finished wall should look like
<wall>/manifest.csv        one row per brick
<wall>/manifest.json       the same, plus every setting that produced it
<wall>/README.txt          the settings in prose
```

The scope selector next to *export zip* limits it to what is not yet engraved,
to the queued, or to the one selected brick — so you can cut in batches instead
of regenerating a whole wall each time.
