# Changelog

## Unreleased

- **Align faces:** A new tool next to Lay flat brings a face of the selected part against a face of another part. Click the tool, the part's face, then the other face. "Face to face" puts them back to back, "Flush" lays them in one plane, and a gap leaves room between them (a negative one presses them together). The part turns the shortest way about the clicked point until the faces are parallel - not at all if they already are - and then slides only along the target face's normal, so it keeps its place sideways. A 30-degree-turned, 20-degree-tilted box lands with four corners exactly on the target plane and no point past it. From layerling, asked for by @RobbieKnobbie (#163).
- **Knurling:** A new shape for grips - a round body with grooves all around, for knobs, thumb wheels and tool handles. "Straight" runs the grooves along the axis, "Crossed" lays two slanted rows over each other into small diamonds. Diameter, height, number and depth of the grooves, the chamfer on both ends and, for crossed knurling, the grooves' angle can be set. No groove gets finer than 0.8 mm around the grip - finer than that no FDM printer shows - so the number of grooves is capped by the diameter: 78 on 20 mm, 23 on 6 mm. It sits right after the gear in the shape library. From layerling, which builds straight knurling as an exact CAD body through a profile extrusion we do not have; here it is a mesh, like every shape but the primitives.
- **A revolved sketch is an exact body:** Revolve now builds the body with OpenCascade instead of stacking slices into a mesh. So Hollow, Fillet and Chamfer work on it - hollowing a revolved cup failed before - and it has a few hundred triangles instead of tens of thousands. An arc in the outline stays an arc. Start angle and sweep work as before. A profile that crosses the axis, and the filled variant used for cutting, stay meshes; a body revolved by an older version stays a mesh too, and the edge tools now say so and name the way out (open Edit sketch and finish again). From layerling, reported by @ucito (#167).
- **Hollow can leave any side open:** Instead of top, bottom, both or none, there is a switch for each of the six sides, in any combination: front alone makes a slot for a drawer, left and right a tunnel. Two older faults came out while measuring this. With "bottom" open, hollowing used to fail with "no face found", and "top and bottom" opened only the top: the kernel already returns outward normals, and we turned the ones at the low end of each axis back inwards. And with no side open the body was not hollowed at all but shrunk by the wall thickness - a closed hollow body is now built as the outer body minus the inner one. The wall limit follows the openings: a measure only counts when both of its sides stay closed. From layerling, asked for by @RobbieKnobbie (#159).
- **Patterns can climb and spiral:** A row steps along X, Y and Z at once - a diagonal row, a staircase - instead of along one axis. A circle has a rise per copy (a screw) and a change of radius per copy (a flat spiral); both together give a conical spiral. A spiral running inward stops at the centre instead of throwing its copies through to the other side. From layerling, asked for by @mobiusfix (#145).
- **Small fillets no longer leave a sawtooth:** A fillet of about 0.2 to 0.9 mm round a large circular edge came out with visible zigzags along the seam, in the editor and in the slicer. The mesh strayed 0.1236 mm from the true surface at standard quality - five times the 0.025 mm the quality promises, because one triangle spanned most of the quarter arc. The mesh is now measured against its own faces and, where it strays, rebuilt with a tighter angle (0.1, then 0.05, under 400,000 triangles): 0.0084 mm at standard, 0.0021 mm at fine. Draft quality is left alone, because it keeps its own coarser promise. From layerling (1.45.0).

- **Split:** A new tool in the Modify group cuts the selection in two with a plane. It starts flat - the cut that brings a part too tall for the printer onto the plate - and can be set to any of the three axes, turned about the other two and moved along its normal; a translucent plane shows where it stands. "Pick a face" lays it on the next face you click, tilt included. Every selected body the plane crosses becomes two closed bodies, a hole becomes two holes, and a hollowed body keeps its cavity. The halves are meshes, so their shape settings are gone. From layerling, which took it from a SketchForge fork by WC3D.
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
