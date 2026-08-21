# anti-epigraph — bremen

Six pages, no build step, no dependencies to install.

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
- **[tafeln.html](tafeln.html)** — die Tafel. The same volumes cut the other way:
  one block per place, its goods running down it. One table at a time, set and
  exported as an image.
- **[stapel.html](stapel.html)** — der Stapel. The same block stood up: one brick
  a course, three goods to a face, so the stack is as high as the place had goods
  to send.

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
Nothing else does: the desks need no network, and neither do the trade tables,
die Tafel or der Stapel — d3-geo, the coastlines, three.js and all eight faces
are vendored, so those open straight off `file://` too.

## Layout

```
index.html            the piece
layout.html           the pallets
engrave.html          the engraving desk (regular wall)
handel.html           the 1851 trade tables
tafeln.html           one block per place, set on its own
stapel.html           the same block stood up in brick
css/
  piece.css
  dashboard.css
  yard.css            image slots and the bare-position list
  handel.css          paper, rules, leader dots, the six goods colours
  tafeln.css          the faces a block can be set in
  stapel.css          the yard the stack stands in
fonts/                ultra, abril, rozha, bevan; bodoni moda, libre bodoni,
                      playfair, libre baskerville — all self-hosted
data/
  handel-all.js       every volume in one global — what the page loads
  handel-<year>.json  the same, one file per volume, for anything else
  world-110m.js       natural earth coastlines (world-atlas 110m)
js/
  piece.js            the three.js scene
  lib/
    three.min.js      three.js r128, vendored so the yard opens off file://
    zip.js            store-mode zip writer (~120 lines, no dependency)
    idb.js            indexeddb — projects (desk), plans (pallets)
    d3-geo, d3-array, topojson-client
  handel/
    data.js           the bundle folded into the shapes the views ask for
    map.js            natural earth projection, routes, proportional discs
    views.js          the ledger, the goods, the shipping, the drawer
    app.js            tabs, state, the address bar
  tafeln/
    model.js          the volume by place — two printings reconciled,
                      dittos resolved, measures folded
    plate.js          one block — every metric and face a parameter
    ink.js            the press: turbulence, displacement, ink gain, specks
    ui.js             the block, and every setting on it
    board.js          (not loaded) the sheet that laid many blocks on a grid
  stapel/
    faces.js          what is printed on a stretcher, a header and a bed
    scene.js          the stack, the lights, the orbit
    ui.js             the yard
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

**Laser** — resolution, then the five ways of getting from a photograph to
something a laser can burn: grayscale, Floyd–Steinberg *dither*, *scatter*,
*random* and hard *threshold*, with brightness, contrast, gamma and invert.
They are the same five the pallet plan offers, on the same engine — see [How
the tone is broken up](#how-the-tone-is-broken-up). *scatter* is the dither
with its decision point jittered, so the regular weave breaks up without the
tone shifting; *random* decides every pixel on its own against a cut that
wanders, which is grain and no pattern at all. *grain* sets how far the cut
wanders and *seed* fixes which grain you get — the seed is saved with the
project and printed in the exported README, so the file you looked at and the
file you send next week are the same file. *shuffle* goes looking for another
one on purpose.

*what burns* shows exactly the bitmap the head will trace, so there are no
surprises. Bleed engraves past the brick edge so a slightly misplaced blank
still lands covered.

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

### The bed — what is on the machine

The machine cannot reach a wall. It reaches about 410 mm square, and an NF
stretcher is 240 × 71 — so a wall is never cut as a wall, it is cut a handful
of bricks at a time. *the bed* is that handful: the bricks that are lying on
the machine at this moment.

**Shift-click** bricks on the wall to put them on the bed and to take them off
again — cmd or ctrl do the same, and `b` does it for the selected brick. Run
along a course with shift down and you have picked out a bedful. *take the
queued* fills the bed from the ledger instead. They are marked with a dashed
ring on every view, and they are remembered with the project.

*the bed* view then shows the machine's own square with those bricks laid in
it, numbered in the order the head will burn them — from the corner nearest
the origin outwards, which is the shortest travel and the order a hand would
lay them in. They lie either **packed**, in rows from that corner with the
joint you set between them, or **as on the wall**, which keeps the block square
and is what you want when the bricks you picked are a contiguous block. The
courses turn over between the two, because the wall counts down from its top
edge and the bed counts up.

*each brick lies* turns the bed. An NF stretcher is 240 × 71, and a work area
deeper than it is wide takes more of them stood on end than laid flat — so
**turned** puts them on end, and **whichever the bed takes more of** picks for
you.

**What turns is the bed, not the brick.** Spinning each face where it lies would
keep the arrangement and rotate the pictures inside it, which is the one thing
that cannot be right: these are fragments of a single picture, and a fragment
turned on its own no longer joins the one beside it. So the bed is laid out
upright, as though the machine stood the other way round, and then the whole of
it — the places and the pictures together — goes round a quarter turn
anticlockwise. Nothing moves relative to anything else, so the composition
survives, and a block picked off the wall comes back as that block. The bricks
are also filled in the wall's own order, bottom course first and left to right,
rather than the order they were clicked.

The rotation of the raster is done on the bytes rather than through a canvas: at
exactly ninety degrees that is a re-indexing and not a resampling, so not one
pixel of a dithered face is turned into a gray the head cannot burn. The bed
view draws the faces as they will lie, so there is nothing to work out — lay
each brick the way the picture shows, and the file names the corner and says
*turned*.

*one gcode for these bricks* writes the lot as a single `.gc`. Two things it is
careful about:

- **It will not write a file the machine cannot run.** The layout is measured
  against the work area — origin included, since the origin is the work zero —
  and if any face falls outside it the button is dead and the panel says by how
  much, per brick, rather than letting the limit switch find out. The footer
  states the rectangle the head will keep to at all times.
- **The head does not travel the bed between the bricks.** Each face is
  rastered on its own, at its own corner, and the bodies are strung together —
  so the beam only ever crosses the faces themselves. A single raster spanning
  the whole bed would sweep every scanline across the bare ground between them,
  at feedrate, for every line of the job.

Two things the emitter is strict about, both learned the hard way. **Every
comment is folded to 70 columns of plain ASCII.** GRBL reads one line at a time
into a 128-byte serial buffer, and a longer line does not merely wrap — it
overflows, the controller errors on it, and since the header stands before the
first move the job then does nothing at all: no frame, no burn, no useful
complaint. An em dash is three bytes and a `×` is two, so a header set in this
desk's own typography runs half again as long as it looks. The prose belongs on
the screen; what goes down the wire is plain. **And the fit check counts the
run-up, not just the faces.** Overscan carries the head past the end of every
row before the beam comes on, so checking the faces alone would pass a file that
drives the head into the rail.

The file names each brick and the corner it is laid to, in the header, so the
bed can be set out from the file and checked against it afterwards. With *walk
the work before the beam is on* ticked the head traces the work rectangle in
rapids before anything is lit — square the bricks to that, and the framing box
is the bricks rather than whatever the ink happened to reach.

The zip's scope selector has *only what is on the bed* to match, so the PNGs
and SVGs for the same handful come out alongside it.

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
to the queued, to the one selected brick, or to what is on the bed — so you can
cut in batches instead of regenerating a whole wall each time.

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

### Two printings, never both

The volumes print the same goods twice. The **Waarenverzeichniss der Einfuhr**
lists them country by country; the **by-article tables** list them article by
article with the countries as rows. Adding the two counts Cuba's sugar twice,
under two different names — so a place the country lists reach is taken from
them entire, and the by-article table fills only the places they never reached.

The country lists are much the finer of the two. Brasilien 1851 runs to 25 goods
there against 10 in the by-article table, and its largest import of all —
*Caffee*, 800,677 Ld'or — stands only in the list. A block says at the head of
the panel which printing it came off, and one built off the by-article table is
marked, because it is the coarser reading rather than the whole of what that
place sent.

1859 has no country lists at all, so every block that year is by-article.

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

### Setting the block

One table at a time. Pick the place — the list runs biggest *Werth* first, and
↑ ↓ steps through it — then set how wide the block runs and how many goods it
shows.

Depth is a count of lines rather than a height in pixels, because a set block is
always a whole number of lines deep. Goods past the count are not dropped but
folded into one line — *Uebrige Waaren (74)* — carrying their summed value,
which is what the volumes do with their own tails and call *Uebrige Einfuhr*. So
the sum at the foot is right whatever the block is cut to. The fold takes a line
of its own, so a budget of 14 names 13 goods and folds the rest.

The goods panel lists every good in the block, greying the ones that fell into
the fold, so what is being left out is on screen rather than guessed at.

### Every setting on it

The defaults in `plate.js` are one reading of the printed page, not the only
one, so all of them are exposed and none are constants:

- **the type** — the display face and the text face, chosen off the eight
  self-hosted ones or a system Didot; the size of each corpus separately (the
  place, the *Einfuhr von*, the column heads, the goods, the foot); tracking on
  the name and on the heads; the weight the goods are set in; and what a name
  too wide for the measure does — squeeze, shrink, or break in two.
- **the spacing** — every gap in the block: inside the frame on three sides,
  under the kicker, under the name, under the heavy rule, the head line, the
  line the goods sit on, the gap inside a column, and the lines round the sum.
- **the rules** — the weight of the heavy frame, the white between it and the
  hair inside it, the rule under the name and how far it is held clear of the
  sides, the rule under the heads, the vertical column rules, the rule over the
  sum, and the leader dots: where they start, how far apart, how big.
- **the canvas** — close round the block, or a fixed width and height with the
  block set in the middle of it, at the top, or to one side.

### The press

A block drawn on a canvas is too clean to have come off a bed of metal in 1860.
The scans show three separate faults, and *the press* puts all three back: the
edge of every stroke wanders, because damp paper and worn type never meet the
same way twice; the ink gains or starves, fattening the fine serifs or breaking
the hairlines outright; and the whole thing sits in grain, with the odd speck on
otherwise clean paper.

This is usually written as an SVG filter — `feTurbulence` into
`feDisplacementMap`, then a hard `feComponentTransfer`. That filters what is
*shown*, though, not what the canvas holds, so it would vanish the moment the
block was exported. `ink.js` does the same three steps to the pixels instead:
two octaves of value noise displace the field, a separable box blur gains the
ink, and a threshold that wanders with the grain brings the edge down. Specks
are hashed per grain of paper rather than sampled off the smooth field, so a
speck is a speck and not a soft blob the size of the turbulence cell.

The grain is sized in paper, not in pixels, so it stays the same on the sheet
whether that is a screen preview or a 4× plate. It costs about 70 ms a megapixel,
so the preview draws clean first and runs the press a beat later — a slider
answers immediately and the paper catches up.

### What leaves

**export png** re-runs the same render at 1× to 4×. Nothing is scaled up after
the fact: the type is set at the export size, so a 4× plate is four times the
type, not four times the pixels. **export csv** writes the same block as
figures — every good, its quantity, its measure and its value, closing on the
sum.

### The faces

Eight to choose between, all self-hosted, so the page keeps its faces off-line
and opens straight off `file://`.

For the place at the head of the block, the fat faces: **Ultra** is the nearest
free cut of the Fette Antiqua the volumes actually use — hairline serifs, the
stress dead vertical — with **Abril Fatface** and **Rozha One** as the same idea
drawn later, and **Bevan** for the fat Egyptian the earlier pages sometimes head
with instead.

For the text and the figures, the Didones: **Bodoni Moda** (which carries optical
sizes, so it holds up small), **Libre Bodoni**, and **Playfair Display**. **Libre
Baskerville** stays on the list as the transitional it is — a century early for
this book, and against a Didone it shows. A mac's own **Didot**, **Bodoni 72** and
**Hoefler Text** are offered too, though a block set in one of those will not
render the same on another machine.

## Der Stapel

[stapel.html](stapel.html) stands the block up in brick.

The brick is 200 × 100 × 50 and never changes — the same one the pallets and the
engraving desk are built round. Laid as a stretcher it shows three faces to
anyone in front of it, and this page prints two of them plus the bed of the top
course:

| face | size | what is on it |
| --- | --- | --- |
| the stretcher | 200 × 50 | the good, run out on leader dots to its quantity and measure |
| the header | 100 × 50 | the value of those same three goods, flush right |
| the bed | 200 × 100 | the place, which printing it was read off, and the sum |
| the far end | 100 × 50 | the place's name, if it is asked for |
| the back | 200 × 50 | the same, where a long name has room to stand |

The two bare faces can carry the place's name, and then it repeats down every
course of the stack the way a title repeats down the spines of a run of volumes
— which is the point of putting it there: from the side a stack stops being a
column of figures and becomes one named thing. It costs almost nothing, because
the name is the same on every brick of a stack: one nameplate is drawn and the
one material hung on all of them, so a stack of thirty courses pays for one.

### Both sides

A brick has two stretchers and two headers, not one of each. Printed on **both
sides** the back pair carries the next three goods and their values instead of
the name, so a brick holds six and the stack comes out **half as high** for the
same reading — Brasilien 1851 falls from eight courses to four, and four stacks
of it from 63 bricks to 32.

Nothing is lost but standing still. No one in front of the stack sees more than
half of what the place sent; the rest is round the back. That is a real cost and
worth choosing deliberately rather than taking for the saving — but for anything
that is going to be walked around, or fired, it halves the clay.

The name has nowhere left to go when both sides are printed, so that control
greys out rather than silently doing nothing.

### The bed

The top course carries the place, the printing it was read off and the sum. It
can be cut to **the source and the sum only** — the reckoning without the place
standing over it in fat face — or to **nothing at all**. In a yard seen from
above the names are the loudest thing on the field, and sometimes the figures
are the point. The place is sized in millimetres on both the faces it appears
on, the bed and the end, and the rule and the source line under it follow its
baseline rather than sitting at a fixed height.

### The pallet

The whole yard can stand on **one EPAL 1**, 1200 × 800 × 144, built the way one
is: three bottom boards, nine blocks, three stringers, five deck boards — which
is where the 144 comes from. It is the same pallet the yard and the engraving
desk are built round. One, not one under each stack: a pallet is 1200 × 800
against a stack's footprint of 200 × 100, so a pallet each would be a yard of
mostly empty deck.

A pallet does not grow, so either the field is cut to it or the stacks hang off
the edge. Which of the two is happening is measured rather than assumed, and the
foot of the page says **on the pallet** or **hangs off the pallet**. *Cut the
field to the pallet* works out how many stacks to a row and what gaps put them
all on the deck with the gaps as even as they can be — six stacks come out three
across at 300 × 600 mm, filling the 1200 × 800 exactly. If they will not go at
all, it says so rather than arranging something that overhangs.

### The order

Left to right, the yard reads as whatever order the stacks were set out in, and
the default — biggest *Werth* first — makes the field a ranking. A ranking is an
argument. **Shuffled** deals them again off the field's own seed, so the plan
says only how many there are and how far each runs; *shuffle* reseeds the deal
and the jitter together. By name, by number of goods, and as picked are there
too.

Three goods to a course, so nothing about the stack is a design decision: the
height **is** the number of goods the place sent. Brasilien 1851 at 25 goods
stands nine courses; Java at three stands one; Hannover at 103 stands
thirty-five. Stand two beside each other and the comparison is already made.

The rows on the header line up with the rows on the stretcher because both faces
are the same 50 deep and cut the same way. The bed is drawn only on the top
course — every other one is buried under the brick above it, so there is nothing
to read there.

Faces are canvas textures drawn in millimetres and multiplied up, so the
typography is set with the same faces, the same leader dots and the same rules
as the flat block on die Tafel, and the resolution is a slider rather than a
constant. The press from `ink.js` can be run over them too, which is worth doing
before anything goes near a laser: what the machine burns is a bitmap, and a
bitmap that has already been through the press is closer to what the volume
looks like than clean vector type ever gets.

### The yard

Any number of stacks can stand at once. Pick as many places as are wanted and
they are set out on a field: so many to a row, the gaps across and back given in
millimetres between the bricks themselves rather than between their centres, so
a gap of nought means the stacks touch. Every other row can be shoved over, the
whole field knocked about by a seeded jitter, and each stack turned a little off
square.

Seen through **the plan** — a flat camera looking straight down — that field is a
sheet of beds, one to a place, each carrying its name, which printing it was
read off, and its sum. Nothing else of a stack shows from directly above, so the
comparison is made by the plan alone: how many stacks, and how far each runs.

A yard of ten stacks at full texture is a great deal to hold, so the resolution
drops to 4 px/mm when the field opens up, the four faces that carry nothing are
made once and shared between every brick in the yard, and the foot of the page
prints the running texture cost. **Print every face** off draws only the beds,
which is all the plan shows and a fraction of the memory.

Three.js r128 is vendored into `js/lib/`, so the yard opens straight off
`file://` like everything else here. Orbit is written out by hand — drag to turn,
wheel to come closer — rather than pulling a loose OrbitControls file in after it.

## The classes

The volumes divide trade into six heads — *Verzehrungs-Gegenstände*, *Rohstoffe*,
*Halbfabrikate*, *Manufactur-Waaren*, *Industrie- und Kunsterzeugnisse*,
*Contanten und edle Metalle* — and print a total under each, place by place.

**Only as a total.** No individual good is tagged with its class anywhere in the
source: the Waarenverzeichniss simply lists goods, in class order, alphabetically
within each class, and the class headings themselves did not survive the
extraction. `handel.html` never classifies a single good either — its category
bars are read straight off those printed totals.

So the class of a good is not in the data and has to be read off its name, which
is what `Model.category` does. It places about **89%** of goods across the five
volumes. The rest fall to *nicht zugeordnet*, which is **shown by default**, so
that filtering never quietly drops a good on the floor — an unplaced good is
visible and countable rather than absent.

The obvious check — sum the classified goods per place and compare against the
printed per-class totals — does not work, and it is worth saying why: the
itemised goods do not add up to the printed totals in the first place. Hannover
1851 itemises 2.55 million Ld'or against a printed total of 4.72 million, barely
half. The two tables were never meant to reconcile line for line, so a
disagreement measures that gap and not the classifier. Coverage is the honest
figure, and spot-checking is the honest test.

By default the two classes the volumes themselves put first are shown —
*Verzehrungs-Gegenstände* and *Rohstoffe* — plus the unplaced. The other four are
off. Every panel lists all seven with what each holds in the block in hand, so
turning one off says exactly what it costs.

A filtered block does not show what a place sent, but what it sent under the
classes asked for, and the sum at the foot says so: *Werth der gewählten Waaren*
rather than *Werth im Ganzen*. That line is decided in one place, `Model.totalLabel`,
so the flat block and the brick bed can never disagree about it.

## Cutting a block down

A place like Newyork 1851 sends 78 goods, which is 26 courses — a stack taller
than the pallet it stands on. Two ways to cut it, and they answer different
questions.

**A floor under the Werth.** The long tail is what makes a block unwieldy, and
it is worth almost nothing: 57 of Newyork's 78 goods are worth under 5,000
Ld'or, and between them they come to 3% of what the place sent. Setting the
floor at 5,000 takes the stack from 26 courses to 7 and keeps 97% of the value.
The panel prints what is kept — *keeps 81.3% of the Werth* — measured against
everything the place sent, so the cost of the floor and of the class filter can
be read together rather than guessed at.

A good the page never valued is not small, only unknown, so a dash is never cut
by the floor.

**Striking goods out by name.** Where a floor is too blunt — the thing making a
stack unwieldy is one good you simply do not want — any good can be struck from
**every** table at once, and put back the same way. The list runs over everything
standing in the yard, biggest Werth first, so what is worth striking is at the
top where it can be seen.
