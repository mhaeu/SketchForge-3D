# Changelog

## Unreleased

- A group resized after grouping is exported, aligned and snapped at the size it shows. Its mesh put the parts together at the size they were grouped at, so STL, OBJ and 3MF got the old size and the filament estimate reported the wrong volume. From layerling, contributed by @gogades (#127).
- "Lay flat on face" lights up the flat face under the pointer before the click, so you can see which side goes down and turn the view to look at the others. On a mesh denser than 20,000 triangles only the facet under the pointer lights up: searching the whole face costs 22 ms at 24,000 triangles, and the click still searches it. From layerling, asked for by @Jeff-Haas (#130).
- A fingertip reaches 16 pixels beside the edge of a body instead of 6, because it covers more than a mouse pointer. The mouse is unchanged. From layerling, contributed by @rmpel (#123).
- Snap grids of your own: in the workspace settings, add a measure with a name and a size in millimetres - the 2.54 mm of perfboard, say - and the snap menu offers it whole, halved and quartered. A step keeps its millimetres, so a design still snaps right after its measure has been removed from the settings. From layerling, contributed by @rmpel (#118).

## 1.1.0

A minor release rather than a patch: everything below has been sitting
unreleased since 1.0.9, and it adds tools rather than only mending them.

New tools

- Hollow turns a solid into a shell with a chosen wall thickness, with any set of sides left open, built on the CAD kernel's `shell`/`offset` (occt-wasm raised to ^5.4.0 for the join type they need). The wall keeps its thickness when the body is resized afterwards instead of growing with it.
- Section view cuts the display along a plane so the inside is visible, without changing the bodies. What the plane hides cannot be clicked, measured, snapped to or pinned a note on; the cut face itself stays reachable.
- Point to point and point to workplane move the first-picked body so the two marked points coincide, or so the marked point lands on the active workplane.
- A target menu decides what a click grabs - free on a surface, free or centred on an edge, the centre of a face, or a corner - shared by point snapping, the rotation pivot and lay flat.
- Lay flat rotates a body so the clicked face rests on the workplane.
- The rotation pivot can be set by clicking a face; the body then turns around that point.
- Pattern repeats the selection in a row or around a circle.
- Cutting tools: trim flush against another body, trim at the workplane, and clear out the interior of a tube or any self-drawn hollow body.
- Three bore shapes join the palette as cutters: counterbore, countersink and teardrop hole.
- An object list shows every body, with range selection by Shift.
- A group can be opened to change its parts without taking it apart.
- Notes sit on the workplane or on a body and travel with the project; they stay out of every export.
- Region resize works on a box inside the object: only what the box holds is stretched, the rest keeps its shape.
- Loft morphs between two cross-sections.
- New shapes: rounded box, honeycomb, ellipse, polygon, thread, spring, ruler, loft, oval, semicircle, pie slice and bolt circle, plus threaded heads (lens head, set screw, Torx).
- Sketch mode gained real circles and arcs, rounded corners, alignment guides, a free rotation handle, a third mode where the shape follows a path, SVG import, and rotate/mirror/scale.
- Extrusion with twist and an offset top face; taper and height per side.

Print preparation

- Overhangs are hatched red and white in the view, from a chosen angle (30 to 70 degrees, 45 by default).
- A warning names the bodies that stand taller than the printer can build.
- The export window estimates volume, weight and filament length for PLA, PETG, ABS, ASA, TPU or PA - worked out as solid, so it is an upper bound.
- 190 printers can be chosen by name; each sets plate width, depth and build height together. The numbers come from OrcaSlicer's profiles.
- The edge tool works on the exact body a STEP import brought with it instead of its triangles, so a round rim is one circle rather than dozens of facet edges.
- 3MF files can be read.
- STEP export carries a body whose edges were filleted or chamfered, rounding included.

Interface

- The toolbar measures itself and steps its icon size down, or wraps, instead of running off the edge - no more zooming the browser to 67 per cent to reach the last group.
- Point tools show a preview of what a click would grab before the click.
- A click on a corner handle types width and length together; Tab moves between them, Enter applies both in one step.
- Shift while dragging holds the body to one axis of the workplane; Alt while dragging leaves a copy behind.
- A box selection with Shift turns each body in it around, as a Shift click does for one.
- The snap grid stays reachable when the body settings are collapsed.
- The interface speaks German as well as English, down to the exercises, messages and shape names.
- Transparency per object, with a slider under the solid/hole choice.
- The arrow keys move a body the way the camera sees it.
- Axis chaining as an L/W/H switch in the toolbar.
- Frame the selection (Shift+F) and an orthographic view button in the camera bar.
- A saved project can be inserted into the open one, and every project can be backed up at once.

Fixes

- A saved project no longer opens into an empty workspace: the reference point was written into the file as a body kind the reader refused, and the failed read then replaced the stored project with nothing. The read now drops what it cannot use, keeps the file, and a failed read never overwrites anything.
- "This page couldn't load" is gone: the app has its own error page, which names the error and offers the way back instead of clearing the project.
- Clicking the gap between two parts of one object no longer selects the object, and neither does dragging a selection box through it. A press that just misses still means the body beside it.
- The reference point no longer ends up inside a group, no longer takes selection handles, and stays out of copies, exports and frame selection.
- Hollowing out an interior now also recognises a rotated tube, a baked body that was resized afterwards, and a self-drawn hollow body.
- Trimming flush now cuts against the body that was clicked last, not the one that was built last.
- The region box no longer slides through the body, keeps its taper, survives a rotation into the workplane, and stops exactly at its own faces.
- A rotated body remembers what it is and how it stands, so its rotation angle and its taper fields stay right.
- Undo brings the workplane back with it.
- Stored CAD geometry is no longer rebuilt as B-splines by a plain move - a fillet's analytic faces survive the next edit.
- Mesh density no longer falls back after later fillets, and fine edges stay clickable in the edge tool.
- Export merges overlapping bodies, so a file no longer holds two shells inside one another.

## 1.0.9

- Corrected Top and Bottom camera views so they align exactly with the vertical axis in both perspective and orthographic projection.
- Added Ctrl/Cmd + right-button panning in Sketch mode while preserving middle-button panning.

## 1.0.8

- Duplicated objects now stay in the exact position of their source instead of receiving an automatic offset.
- Added geometry shortcuts: `R` rotates selected objects by 45 degrees and `Shift+R` rotates them by 22.5 degrees around the active workplane normal.
- Corrected rotation controls so objects turn in the direction indicated by the pointer on every rotation plane.
- Kept selection outlines, resize anchors, and height controls stable during close zoom while naturally hiding controls that leave the viewport.
- Kept object faces visible from inside the object and hid rotation controls while the camera is inside the selection.

## 1.0.7

- Raised the supported `project.json` size in `.skf` packages from 32 MiB to 64 MiB and compacted new project exports without removing editable data.
- Reused decoded derived-mesh data across restored history states to reduce memory pressure when opening large `.skf` projects.
- Prevented workspace-only changes from advancing the persisted shape revision and replacing newer live objects with an older snapshot.

## 1.0.6

- Fixed dense STL imports failing with `Invalid string length` while creating their initial undo-history fingerprint.
- Streamed large numeric mesh arrays into deterministic hashes instead of converting millions of coordinates to one oversized JSON string.

## 1.0.5

- Made the rotation handles larger and aligned their arrow glyphs with the model faces as the camera moves, including stable behavior on long objects.
- Positioned the lower rotation handle consistently at the model base and corrected its visual and drag directions.
- Added an optional **Select before moving** workspace setting so the first click selects an object without immediately dragging it.

## 1.0.4

- Fixed imported STL objects briefly appearing and then vanishing when a stale IndexedDB project read completed after the import.
- Prevented older persisted project data from overwriting newer live editor state during asynchronous project hydration.

## 0.1.0

- Initial open-source alpha.
- Browser-based 3D workspace with primitive shape editing.
- STL import and STL/OBJ export.
- Grouping and hole subtraction workflows.
- Local project dashboard with generated thumbnails.
