# anti-epigraph — bremen

Five pages, no build step, no dependencies to install.

- **[index.html](index.html)** — the piece. One pallet of brick laid flat, the fazenda
  painting inscribed across its top course and broken by scraps of the Bremen
  paperwork. Drag to rotate, click a brick to pull it out — whatever was under
  it surfaces carrying its own fragment.
- **[layout.html](layout.html)** — the pallets. Three euro pallets, three pictures
  across them, one laser file per position on the grid.
- **[engrave.html](engrave.html)** — the engraving desk. The same idea for a wall
  standing up rather than a field laid flat.
- **[handel.html](handel.html)** — *Bremens Handel und Schifffahrt*. The trade tables
  of the 1851 volume, read off the scans and set again: a map of where the goods
  came from, the country ledger, the goods, the shipping. Set in the volume's own
  furniture — fat Egyptian headings, leader dots, figures flush right, a dash
  where the page has a dash.
- **[tafeln.html](tafeln.html)** — die Tafeln. The same volumes cut the other way:
  one block per place with its goods running down it, laid out on a sheet by hand
  and exported as an image.

Every brick is 200 × 95 × 50 — one size, set in one place — so the field is a
grid and one blank is interchangeable with any other. Nothing keeps a list of
bricks, because until a brick is engraved there is nothing to list. What has a
name is the **position**: `A-03-07` is pallet A, course 3, seventh along that
course. That is the name of its file, and the name that goes on the brick when
it comes off the machine.

## Running it

```
python3 -m http.server 8000
```

then open `http://localhost:8000/`. A plain `file://` open works for the two
desks too, except for the three bundled source images the wall desk lists —
the browser will not read a sibling file from `file://`, so use *choose an
image…* or drop a file in instead.

The piece pulls three.js from a CDN, so it needs a connection the first time.
The desks need nothing, and neither do the trade tables — d3-geo, the coastlines
and both faces are vendored, so `handel.html` also opens straight off `file://`.

## Layout

```
index.html            the piece
layout.html           the pallets
engrave.html          the engraving desk (regular wall)
handel.html           the 1851 trade tables
tafeln.html           the composing stone — one block per place
css/
  piece.css
  dashboard.css
  yard.css            image slots and the bare-position list
  handel.css          paper, rules, leader dots, the six goods colours
  tafeln.css          the two faces the blocks are set in
fonts/                bevan, libre baskerville, ultra, libre bodoni — self-hosted
data/
  handel-all.js       every volume in one global — what the page loads
  handel-<year>.json  the same, one file per volume, for anything else
  world-110m.js       natural earth coastlines (world-atlas 110m)
js/
  piece.js            the three.js scene
  lib/
    zip.js            store-mode zip writer (~120 lines, no dependency)
    idb.js            indexeddb — projects (desk), plans (pallets)
    d3-geo, d3-array, topojson-client
  handel/
    data.js           the bundle folded into the shapes the views ask for
    map.js            natural earth projection, routes, proportional discs
    views.js          the ledger, the goods, the shipping, the drawer
    app.js            tabs, state, the address bar
  tafeln/
    model.js          the volume by place — dittos resolved, measures folded
    plate.js          one block, set the way the volumes set it
    board.js          the sheet, the columns, the step, autoflow
    ui.js             the stone — drag, span, row budget, export
  yard/
    pack.js           pallet geometry, the grid, picture → position crop
    plan.js           the plan, and the record of what has been cut
    export.js         png / svg / gcode per position, sheets, manifest
    layout-ui.js      the pallet plan
  engrave/
    tiling.js         millimetre maths: brick → face → wall → source crop
    imaging.js        crop, levels, dither, the clay simulation
    gcode.js          the bitmap as machine moves, run-length encoded
    export.js         svg emit, manifest, README, zip assembly
    state.js          the project model and its record
    ui.js             the desk
images/               the three sources the piece uses
```

## Three pallets

The order of work:

1. **Set the brick and the pallets.** 200 × 95 × 50 on three EPALs by default.
   The grid falls out of that: how many across, how many courses, how many the
   whole field holds.
2. **Say how many bricks you have.** *fill the whole grid* takes the maximum;
   untick it and lay any smaller number, dealt evenly across the three pallets
   so none of them is left bare. Click any position to *leave bare* if you want
   the hole somewhere particular rather than at the end of a course.
3. **Drop the three pictures in**, one per pallet, and set how each is fitted.
4. **Export the zip** and cut. One `.gc`, one `.svg` and one `.png` per
   position, named for it.
5. **Write the name on the brick** before it leaves the machine — or switch on
   *burn the code into the face* and let the laser do it.
6. **Tick them off.** Double-click a position on the field to mark it engraved,
   or press `e q f s p` with one selected. The record lives in the plan and
   saves itself as you go.
7. **Lay the field** from `layout.svg`, which is the same grid at true size
   with every position named.

### How many bricks

Three euro pallets side by side are 3600 × 800 mm — 2.88 m² of deck. 200 mm
goes into a 1200 mm pallet **six times exactly**, so with no joint and no
margin the bricks butt against each other and against the pallet edge:

**6 across × 8 courses = 48 a pallet, 144 for the three.** 95% of the deck,
the missing 5% being a 40 mm strip along one edge — 8 × 95 is 760 of the
800 mm depth, and there is no ninth course to be had. It sits as 20 mm at
each end by default.

Turned 90° the same pallet takes 12 × 4 — also 48, also 95%, with the 60 mm
strip down the sides instead. The count is identical; the picture is not.

So: **collect 160.** 144 go down and the rest covers breakage and blanks that
turn out unusable. Two thirds coverage is about 96 bricks, half about 72 — set
the count and the field redraws so you can see what that looks like before
committing. At roughly 1.7 kg a brick, 144 is ~246 kg over three pallets,
~82 kg each, well inside what an EPAL carries.

Change the brick size, the joint, the margin or the pallet count and the grid,
the capacity and the coverage all move with it.

### The joint, and where the slack goes

Butted tight there is no joint to speak of, but the moment you put one in, a
whole number of bricks stops fitting the pallet exactly and the leftover has to
go somewhere — which is the one thing about this that is not obvious:

- **in the border** (the default) — the joint is exactly the number you type
  and the slack becomes bare deck, split evenly around the field.
- **in the joints** — the field reaches both pallet edges and the slack is
  divided into the gaps. The number you type is then only a *minimum*, used to
  decide how many bricks fit: on a 15 mm margin, ask for 6 mm and the joints
  come out at 42.5 mm across and 17.5 mm between courses.
- **at the far edge** — the joint is what you typed and all the slack piles up
  on one side.

The hint under the joint fields always states the joint that will actually be
laid, so the two are never in doubt, and *butt them tight* zeroes both the
joint and the margin in one go.

With the bricks touching, a **bleed** has no joint to fall into — it engraves a
strip the neighbouring brick is also carrying. The footer says so when that
happens. Bleed is 0 by default; it earns its keep only when there is a gap.

### How the tone is broken up

Five ways to get from a photograph to something a laser can burn, all on the
same levels:

- **grayscale** — power follows tone, no dithering. Cheapest file by far.
- **dither** — Floyd–Steinberg. Accurate, but it leaves a regular weave in
  flat areas that reads as a pattern rather than as grain.
- **scatter** — the same error diffusion with the decision point jittered, so
  the weave breaks up. The error is still carried forward, so the tone stays
  exactly as honest as plain dither.
- **random** — white noise. Every pixel is decided on its own against a cut
  that wanders, so there is no structure to find at all, only grain.
- **threshold** — hard black and white, no dithering.

*grain* sets how far the cut wanders, and *seed* fixes which grain you get.
The seed is saved with the plan and printed in the exported README, so the
file you looked at and the file you send a week later are the same file —
*shuffle* is how you go looking for a different one on purpose. At grain 0%,
random collapses to threshold and scatter collapses to plain dither, which is
a useful way to see what the noise is doing.

All four 1-bit modes are tone-accurate: a black-to-white ramp comes out 50%
covered in every one of them.

**They are not equally cheap to cut.** One brick at 254 dpi, from the same
picture:

| mode | moves | file |
| --- | ---: | ---: |
| grayscale | 30 k | 0.5 MB |
| threshold | 1.3 k | 0.2 MB |
| random | 900 k | 10 MB |
| scatter | 1.1 M | 13 MB |
| dither | 1.5 M | 17 MB |

A move is a change of power along a scanline, so a dithered brick is a wall of
tiny instructions. Over 144 bricks that is well over a gigabyte of `.gc` —
export in batches with the scope selector, or untick *gcode* and send the SVGs.

### The three pictures

By default each pallet carries its own image, so the field reads as three
pictures side by side; *one picture across the whole field* spans all three and
lets the pallet gaps cut it. Either way the picture is sampled continuously in
millimetres: what falls in a joint is lost, and a brick set down in the wrong
position carries the wrong fragment with nothing on it to say so. Lay by the
name.

### What the zip contains

```
<plan>/png/A-03-07.png    the bitmap, one per position, at the chosen dpi
<plan>/svg/A-03-07.svg    the same bitmap at true mm size, with a red
                          outline rect on the brick edge
<plan>/gcode/A-03-07.gc   the same bitmap as moves, ready to send
<plan>/layout.svg         the whole field at true size, every position
                          named and coloured by status: the install sheet
<plan>/pallet-A.svg       the same, one pallet per sheet
<plan>/manifest.csv       one row per position and where it goes
<plan>/manifest.json      the same, plus every setting that produced it
<plan>/simulation.png     what the finished field should look like
<plan>/README.txt         the settings in prose, and the warnings
```

Every file is the same size, so any of them will fit any blank — that is the
whole point, and also the one thing that can go wrong. What makes a brick
`A-03-07` is the fragment of picture burnt into it, and an engraved brick with
nothing written on it cannot be identified by looking at it. There is no list
anywhere that could recover which one it was, so the name goes on before it
leaves the machine — in pen, or with *burn the code into the face*, which puts
it a few millimetres high in a corner.

The scope selector next to *export zip* limits the run to what is not yet
engraved, to the queued, or to the one selected position, so a batch is a batch
rather than a re-render of the whole field. The plan saves itself to IndexedDB
as you work; *save plan as .json* and *export csv* are the backups that leave
the browser.

## The desk

The older tool: a wall standing up rather than a field laid flat, with tiles
labelled by position (R03C07) instead of by the code on the brick.

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
The pallet plan adds two noisy modes on the same engine — see below.

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

### What the wall zip contains

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

## The trade tables

[handel.html](handel.html) reads *Bremens Handel und Schifffahrt* — the volume the
scraps in the piece come from. Nothing here is estimated: every figure is a
figure the volume prints, in Louisd'or, and where the page has a dash the page
has a dash here too, not a zero.

Five sheets, under the volume's own headings:

- **Karte** — where it all came from. Natural Earth projection, one disc per
  place with its area following the measure, a route drawn back to Bremen.
  Three measures: **Werth** of the trade, **Schiffe** — the ships themselves,
  2,928 of them arriving in 1851 — and **Last**, what those ships could carry.
  On the value, two filters: the goods legend cuts the discs to the categories
  left standing, and the *Waare* box narrows to one named good — pick *Caffee*
  and the map is the coffee trade alone, Brasilien down to the 23 Ld'or that
  came from China. Hover for the breakdown, click for the place itself.
- **Länder** — the *Uebersicht der Total-Einfuhr / Total-Ausfuhr* itself:
  place against the six goods categories, sortable, with the stacked bar the
  print could not carry.
- **Waren** — the same trade cut the other way: a good, what it was worth, and
  the places it came from.
- **Schifffahrt** — the *Seeschiffahrts-Verkehr*: sea-going ships by the place
  they came from or went to, with how many sailed laden and how many in ballast,
  their capacity in Last, their crews, and the value of what they carried. 1851
  adds up to the printed 2,928 arrivals exactly.
- **Quellen** — which pages were read, how many rows came off them, and the
  check of the printed totals against the sum of their own six columns.

`?jahr=1852` opens another volume, `?platz=cuba` opens a place, `?waare=Caffee`
sets the map to one good, `?gattung=raw_materials,specie_metals` to a couple of
categories, `?mass=ships` puts the map on the ships instead of the value, and
`?richtung=ausfuhr` turns the whole page around. All of them keep up as you
move, so any sheet can be linked to.

### What had to be decided

The volumes print the same trade more than once, and adding the prints together
double-counts it. Two rules follow from that, and both are worth knowing when
reading anything off the page:

- Every ledger is printed as a grand total *and* again split seewärts /
  landwärts. Only the grand-total run is summed. The bundler works out which run
  a page belongs to from its first row — a page that opens with a `Transport`
  carry-over continues the page before it, anything else starts a new run, and
  the first run of a table is the total.
- The goods appear both in the per-country lists and in the by-article table.
  Cuba's sugar stands in both, under two different names. The country list is
  the finer of the two, so it wins wherever it exists; the article table only
  fills the places it does not reach.
- Einfuhr and Ausfuhr are printed as two separate sections of goods pages, and
  once a page is a list of articles the two look identical. Nothing in the
  extraction says which is which — but the scans carry a text layer, and the
  printed heading does: *Einfuhr von Holland und Belgien*, *Specielle
  Nachweisung der Ausfuhr*. The bundler reads that heading and tags the page, so
  the two directions never merge. Every tab keeps its own Einfuhr / Ausfuhr
  switch; where a direction has no goods pages read yet, it says so rather than
  showing an empty search.

Aggregate rows — `TOTAL`, `Transport`, `Recapitulation`, the `oder:` restatements
— are dropped on the way in. `Quellen` shows what the remaining rows add up to
against the printed totals; the gap is where a digit in the scan and a digit in
the print disagree.

The page is black and white, like the volume it reads. That leaves no colour to
spend on the six goods categories, so they are three steps of grey and three
engraved fills — 45°, 135° and horizontal hatching — alternating so that no two
neighbours in a stacked bar share a treatment. Every fill is named as well, in
the legend, the column head and the tooltip, so nothing has to be read off the
texture alone.

### Where the data comes from

The bundle is generated out of the extraction repo, and regenerating it is the
only build step this page has:

```
python 04_bundle_site.py out/ gazetteer.json ../anti-epigraph-bremen/data/
```

`gazetteer.json` there is what turns *den Canarischen Inseln*, *Sachs.-Cob.-Gotha*
and *d. Grönlds-Fischerei* into places with coordinates; the script prints every
name it could not place, so a new volume's spellings show up as a list to fix
rather than as silence.

## Die Tafeln

[tafeln.html](tafeln.html) is a composing stone. The volumes cut their tables by
article — one block headed *Havana*, one *Cuba*, one *Maryland*, and the places
running down each as rows. This page cuts the other way: one block per place,
its goods running down it. Same figures, read from the other end.

Every figure in a block is that place's own figure, and the sum at the foot is
what that place sent — never what the article came to across the world. That
distinction is the whole point of the transpose, so the sum is labelled
*Werth im Ganzen*, or *Werth, so weit beziffert* where some good in the block is
a dash rather than a number.

### The measures

The great colonial goods are weighed net, and the volumes say so once at the
head of a printed block and then carry it down the column on ditto marks. Read
line by line those marks are lost, and the measure comes back as whatever the
OCR guessed nearest — Taback arrives as `Ztr.`, raw sugar as a Greek zeta, and
the same abbreviation mark returns variously as ℨ, ℤ, Ʃ, Ż, ℬ, ℒ or a bare
quote. Two passes fix it, both before the rows are regrouped:

- a ditto is resolved against the line above it in the printed order, following
  chains, which only works while the rows are still in page order — regroup them
  by place first and the line above belongs to a different place;
- **Zucker, Caffee, Sago, Reis, Taback, Cacao** and **Baumwolle** are set to
  `℔ Nto.` wherever they appear. *Cigarren* (reckoned by the Mille),
  *fabricirter Taback*, *Baumwollenwaaren* (Colli) and *Baumwollengarn* are not
  in those families and keep what the page gave them.

*raw measures* in the header switches both passes off and prints exactly what
the scan said, ditto marks and all — this is a reading of the source, not a
correction of it.

### Laying the sheet

A block sits on a column and snaps to a vertical step. Drag it to move; drag the
blue corner to set how many columns it spans and how many goods it shows.

Depth is a count of lines rather than a height in pixels, because a set block is
always a whole number of lines deep. Goods past the count are not dropped but
folded into one line — *Uebrige Waaren (84)* — carrying their summed value, which
is what the volumes do with their own tails and call *Uebrige Einfuhr*. So the
sum at the foot is right whatever the block is cut to.

*fill the columns* drops every block into the shortest column that will take it,
the way the page fills. *cut the sheet to the last block* trims the height to
what is actually laid. Arrow keys nudge the selected block a step; backspace
lifts it off.

### What leaves

**export png** re-runs the same render with the screen furniture — grid,
selection, handles — switched off, at 1× to 4×. Nothing is scaled up after the
fact: the type is set at the export size, so a 4× plate is four times the type,
not four times the pixels. The sheet itself saves as `.json` and loads back.

### The faces

Ultra is the nearest free cut of the Fette Antiqua the volumes head their blocks
with — a true fat face, hairline serifs, the stress dead vertical. Libre Bodoni
is a Didone for the text and the figures, where Libre Baskerville (a
transitional) sat a century too early. Both self-hosted alongside the other two,
so this page also opens straight off `file://`.
