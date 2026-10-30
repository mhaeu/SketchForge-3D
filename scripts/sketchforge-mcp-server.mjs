#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const MCP_ROUTE = "/api/sketchforge-mcp";
const baseUrl = process.env.SKETCHFORGE_URL || DEFAULT_BASE_URL;

const editorTargetSchema = {
  type: "object",
  properties: {
    editorNumber: { type: "number", description: "The 5-digit SketchForge editor number from sketchforge_list_editors." },
    editorId: { type: "string", description: "Optional internal editor id. Prefer editorNumber for human-directed use." },
    timeoutMs: { type: "number", description: "Command timeout in milliseconds. Defaults to 15000." },
  },
};

const tools = [
  {
    name: "sketchforge_list_editors",
    description: "List SketchForge editor tabs that are currently open and heartbeating, including editorNumber and projectName.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sketchforge_read_scene",
    description: "Read the current scene, selection, workspace units, and exact object dimensions from an open SketchForge editor.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        includeRawShapes: { type: "boolean", description: "Include raw WorkplaneShape JSON. Can be large for imported meshes." },
      },
    },
  },
  {
    name: "sketchforge_list_objects",
    description: "List all current objects available in the editor with exact dimensions, position, rotation, and object ids.",
    inputSchema: editorTargetSchema,
  },
  {
    name: "sketchforge_select_objects",
    description: "Select objects by id in the SketchForge editor.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["ids"],
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "sketchforge_delete_objects",
    description: "Delete objects by id, or delete the current selection when ids are omitted.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
        id: { type: "string" },
      },
    },
  },
  {
    name: "sketchforge_create_shape",
    description: "Create a box/cube, cylinder, loft, or simple extruded sketch in SketchForge.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["kind"],
      properties: {
        ...editorTargetSchema.properties,
        kind: { type: "string", enum: ["box", "cube", "cylinder", "sketch", "loft"] },
        name: { type: "string" },
        color: { type: "string" },
        x: { type: "number" },
        z: { type: "number" },
        elevation: { type: "number" },
        width: { type: "number", description: "For loft, this is the bottom end's width." },
        depth: { type: "number", description: "For loft, this is the bottom end's depth." },
        height: { type: "number" },
        size: { type: "number" },
        rotation: { type: "number" },
        rotationX: { type: "number" },
        rotationZ: { type: "number" },
        sides: { type: "number" },
        loftBottomShape: { type: "string", enum: ["Oval", "Rectangle", "Triangle", "Pentagon", "Hexagon"], description: "loft only. Defaults to Rectangle." },
        loftTopShape: { type: "string", enum: ["Oval", "Rectangle", "Triangle", "Pentagon", "Hexagon"], description: "loft only. Defaults to Oval." },
        loftTopWidth: { type: "number", description: "loft only. Independent of the bottom's width, like a cone's top radius. Defaults to matching width." },
        loftTopDepth: { type: "number", description: "loft only. Independent of the bottom's depth. Defaults to matching depth." },
        loftBottomRotation: { type: "number", description: "loft only. Bottom end rotation in degrees." },
        loftTopRotation: { type: "number", description: "loft only. Top end rotation in degrees." },
        loftSegments: { type: "number", description: "loft only. Angular resolution, 8-128." },
        loftLayers: { type: "number", description: "loft only. Vertical resolution, 2-80." },
      },
    },
  },
  {
    name: "sketchforge_import_mesh",
    description: "Import a triangle mesh into SketchForge from raw position and optional normal arrays.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["positions"],
      properties: {
        ...editorTargetSchema.properties,
        name: { type: "string" },
        color: { type: "string" },
        x: { type: "number" },
        z: { type: "number" },
        elevation: { type: "number" },
        width: { type: "number" },
        depth: { type: "number" },
        height: { type: "number" },
        positions: { type: "array", items: { type: "number" } },
        normals: { type: "array", items: { type: "number" } },
      },
    },
  },
  {
    name: "sketchforge_update_object",
    description: "Update one object's exact dimensions, position, color, name, hole state, or rotations.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["id"],
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string" },
        name: { type: "string" },
        color: { type: "string" },
        hole: { type: "boolean" },
        x: { type: "number" },
        z: { type: "number" },
        elevation: { type: "number" },
        width: { type: "number" },
        depth: { type: "number" },
        height: { type: "number" },
        size: { type: "number" },
        rotation: { type: "number" },
        rotationX: { type: "number" },
        rotationZ: { type: "number" },
      },
    },
  },
  {
    name: "sketchforge_align_objects",
    description: "Align two or more SketchForge objects using the same alignment logic as the editor Alignment button.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["axis", "target"],
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" }, description: "Object ids to align. If omitted, uses the current selection." },
        anchorId: { type: "string", description: "Optional object id to keep fixed as the alignment reference." },
        axis: { type: "string", enum: ["x", "y", "z"], description: "x=left/right, z=front/back, y=bottom/top." },
        target: { type: "string", enum: ["min", "center", "max"], description: "Which side/center to align." },
      },
    },
  },
  {
    name: "sketchforge_group_objects",
    description: "Group objects by id using SketchForge's normal grouping/boolean pipeline.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["ids"],
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "sketchforge_hull_objects",
    description: "Wrap the objects with these ids in their convex hull, the smallest body without dents round all of them. Holes among them are cut out afterwards. The parts stay inside, so the hull can be ungrouped again.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["ids"],
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "sketchforge_texture_surface",
    description: "Lay a surface texture onto one body, as the editor's \"Surface texture\" does: grooves, knurling, honeycomb, bumps, irregular cells, a brick wall, knitting, a wound rope, basket weave, carbon fibre in twill, the bark of a tree, wood grain with its annual rings, grain or an image as a height map, for grip or for looks, cracks as in kintsugi, with gold in them as a part of its own, or a text stuck on like a label pressed on (engraved or raised, along a vase's belly or over a box's edge). The body becomes one mesh with the relief, standing where it stood; the body under the relief is kept with it. Called again on a textured body, it makes the texture again on that body with the settings given (the ones not given stay as they were), where the body stands now; remove: true takes the texture off and brings that body back. A texture made before this, or one with other steps after it, has no body kept: undo it instead. Around an axis (projection \"cylinder\", the default, for round bodies such as a cup, a knob or a handle) the spacing is rounded so that a whole number of grooves or cells goes round and the pattern closes without a seam; \"allRound\" suits bodies that are not round, \"flat\" a lid or a plate seen along the axis. Axes are named as the editor shows them, z up. Faces pointing down or up within 30 degrees stay smooth unless bottomFree or topFree say otherwise, so the body stays flat on the bed; faces names the faces that get it instead (faces: [\"top\"] textures only the top, also of a cylinder). A large body takes a few seconds. Returns the new object, the settings used (values out of range are clamped), how many masks took part and what was made: triangles, how many grooves or cells go round, the spacing as made (bricks: also how many courses and how high), and warnings (limited: made coarser to stay within the triangle budget; tooDeep: inward from both sides deeper than half the thinnest size).",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string", description: "The body to texture; defaults to the one selected body." },
        remove: { type: "boolean", description: "Take the texture off a textured body and bring back the body under it. Other settings are ignored." },
        pattern: { type: "string", enum: ["grooves", "knurl", "honeycomb", "bumps", "cells", "bricks", "knit", "rope", "weave", "carbon", "bark", "wood", "grain", "image", "cracks", "text"], description: "Default knurl. cells: irregular cells (Voronoi), their joints cut cleanly like honeycomb's; seed lays them out anew. bricks: a brick wall in a bond (brickBond), spacing a brick's length, brickHeight a course's height, brickJoint the joint's width (width does not count for them); it starts with spacing 12, depth 0.6 and a flat profile, mortar joints sunk in, unless told otherwise. The length is rounded so whole bricks fit (round a cylinder, from edge to edge of a flat side) and the courses so whole ones fit the height; the result's bricks says how many and how high. bark: a tree's bark round the axis (barkType), spacing the size of its pieces or marks; it starts at the bark's own size and depth unless told otherwise. wood: wood grain as a solid, a piece cut from a trunk (woodType, woodCut, ringWidth, woodKnots, woodWobble): its sides show the grain and its ends the annual rings that match it; spacing, width, profile and projection do not count for it. Bark and wood start with topFree and bottomFree 0, so a log's ends show the annual rings (bark's less deep than the bark); pass 30 to keep them smooth. knit: stockinette stitches; rope: rings of a three-strand rope one above the other; weave: a basket of upright stakes and weavers over and under them; these three start raised and round, at the size they were measured at (spacing 5, 6 and 10 mm) unless told otherwise. carbon: carbon fibre in twill (carbonWeave), upright bands spacing wide and crossing bands carbonCross wide, over and under each other one band on from band to band; width is the share a band fills (the rest a narrow gap); it starts with spacing 2.5, depth 0.4, width 0.95, raised, unless told otherwise. Round a cylinder a whole number of the weave's repeats goes round. grain: fine noise in space, without a projection, seam or stretching (spacing is the grain size, default 1.2; projection and axis do not count). image: a grey height map, light = the full depth - a ready one or one's own (image, imageOwn), in tiles spacing wide. cracks: kintsugi cracks that grow across the surface (settings crack*); spacing, width, angle and projection do not count for them. text: words stuck on (settings text*), unrolled onto the surface so they keep their size on a round or slanted wall; spacing, width, profile, angle, projection, bottomFree, topFree, the height band, outside, inside and keepEdges do not count for it - it goes where it is put, only masks keep it off. The result's text says whether letters came onto the body and how many points tore where the text runs over a corner, as a sticker would." },
        spacing: { type: "number", description: "Distance between grooves or cell middles in mm, 0.5 to 200; for cells their size, bricks a brick's length (from joint to joint), knit a stitch's width, rope its thickness (the rings' spacing), weave the stakes' spacing, carbon the upright bands' width, grain a grain's size, image a tile's width. Default 3; for the newer patterns as given there, for an image the ready image's own tile width." },
        depth: { type: "number", description: "How far the surface moves at the deepest place, in mm, 0.05 to 5. Default 0.6." },
        width: { type: "number", description: "Share of the spacing a groove, joint or bump takes, 0.1 to 1; knit: the yarn's thickness, rope: how far the rings grip into each other, weave: the stakes' thickness, carbon: the share of the spacing a band fills. Default 0.6." },
        profile: { type: "string", enum: ["pointed", "round", "flat", "dome"], description: "Cross-section of a groove or joint, or the shape of a bump: pointed (a V; a cone on a bump), round (a soft bell), flat (a flat floor or top), dome (a half circle; a half ball on a bump). Default pointed, for bumps dome." },
        angle: { type: "number", description: "Grooves and knurling: slant against the axis in degrees, -90 to 90 (0 = along the axis, 90 = level round it). Default: grooves 0, knurling 30." },
        faceTurn: { type: "number", description: "The pattern on the faces seen along the axis (a box's top and bottom) turned round it, -180 to 180 degrees: 0 = rows along the front edge, 90 = along the side edge. On a round top or bottom, grooves, rope and knitting run in rings round the middle instead. Default 0." },
        capStyle: { type: "string", enum: ["auto", "rows", "rings"], description: "Grooves, rope and knitting on a top or bottom round the axis: rows (turned by faceTurn) or rings following the outline inwards; auto: rings on a round body, rows on an angular one. Default auto." },
        capEdge: { type: "string", enum: ["auto", "sharp", "over", "fold", "bead"], description: "Where a side round the axis meets a top or bottom that has the pattern too (rope, knitting, grooves): sharp (each ends at the edge), over (the side's pattern bends round the edge and takes the whole top: rows as rings, upright and slanted grooves as rays almost to the middle), fold (the same as a band round the rim only, the top's own pattern inside, as capStyle sets it), bead (a border in the pattern's style runs round the edge, for every pattern: a cord for rope, a cast-off chain for knitting, a round bead otherwise). Default auto: over with rings on top, fold with rows, else sharp." },
        direction: { type: "string", enum: ["inward", "outward", "both"], description: "Into the body, out of it, or centred on the surface. Default inward." },
        projection: { type: "string", enum: ["auto", "cylinder", "allRound", "flat"], description: "How the pattern is laid on: cylinder round the axis (round bodies; the spacing is rounded so it closes; on an angular body standing along the axis, like a box or a prism, it follows the outline round the edges without a seam, a raised pattern bending round them), allRound from three sides (each face on its own; flat sides are cut exactly), flat from one side. Default auto: cylinder on a round body and on an angular one standing along the axis, allRound on others; the result's texture.projection says which." },
        axis: { type: "string", enum: ["x", "y", "z"], description: "The axis for cylinder and flat, as the editor shows it (z up). Default z." },
        bottomFree: { type: "number", description: "Faces pointing down within this many degrees stay smooth, 0 to 90 (0 textures the bottom too). Default 30." },
        topFree: { type: "number", description: "Faces pointing up within this many degrees stay smooth, 0 to 90. Default 30." },
        zoneFrom: { type: "number", description: "Height band with the pattern, from this % of the body's height. Default 0." },
        zoneTo: { type: "number", description: "Height band with the pattern, up to this % of the body's height. Default 100." },
        keepEdges: { type: "boolean", description: "Sharp edges stay smooth. Default true." },
        edgeAngle: { type: "number", description: "An edge bending by more than this many degrees counts as sharp, 5 to 90. Default 30." },
        fade: { type: "number", description: "The pattern fades in over this many mm next to everything that stays smooth, 0 to 10. Default 1." },
        margin: { type: "number", description: "And keeps this many mm away from it first, 0 to 30. Default 0." },
        outside: { type: "boolean", description: "Walls facing away from the axis get the pattern. Default true." },
        inside: { type: "boolean", description: "Walls facing the axis (the inner wall of a cup) get the pattern. Default false." },
        detail: { type: "string", enum: ["coarse", "medium", "fine"], description: "How finely a round profile is resolved. Default medium." },
        crackStyle: { type: "string", enum: ["crack", "lightning"], description: "Cracks: a wandering crack, or a lightning bolt zigzagging round its way. Default crack." },
        crackStart: { type: "string", enum: ["top", "bottom", "rim", "anywhere"], description: "Cracks: where they begin - the top rim (a vase, a cup), the bottom, the rim towards the middle (a plate), or anywhere (any body). Default top." },
        crackCount: { type: "number", description: "Cracks: how many, 0 to 24 (branches come on top). Default 5." },
        crackLength: { type: "number", description: "Cracks: length in % of the body's height (from the rim to the middle: of its radius), 5 to 300. Default 60." },
        crackWidth: { type: "number", description: "Cracks: width at the start in mm, 0.2 to 8; they taper to their end. Default 1.5." },
        crackBranch: { type: "number", description: "Cracks: branching, 0 to 1. Default 0.4." },
        crackJag: { type: "number", description: "Cracks: zigzag and kinks, 0 to 1. Default 0.5." },
        crackRough: { type: "number", description: "Cracks: chipped, uneven edges, 0 to 1. Default 0.3." },
        crackSeed: { type: "number", description: "Cracks: the same number gives the same cracks, another throws them anew. Default 1." },
        crackGold: { type: "boolean", description: "Cracks: fill the notch with a body of its own in gold (a second filament), returned as gold; it goes when the texture is made again or removed. Needs direction inward. Default false." },
        crackRecess: { type: "number", description: "Cracks with gold: the gold's top lies this many mm below the surface, 0 to 3. Default 0.3." },
        textContent: { type: "string", description: "Text: the words, up to 200 characters. Default SketchForge." },
        textFont: { type: "string", description: "Text: Multilanguage, Sans, Serif, Script, Monospace, Rounded or Stencil. Default Multilanguage." },
        textSize: { type: "number", description: "Text: letter size in mm (the height of a capital), 2 to 200. Default 10." },
        textAround: { type: "number", description: "Text: where it sits round the axis in degrees, -180 to 180: 0 the front, 90 the right, -90 the left (with axis x or y, 0 is the top and 180 the bottom). Default 0." },
        textHeight: { type: "number", description: "Text: where its middle sits along the axis, in % of the body's size along it, 0 to 100. Default 50." },
        textTurn: { type: "number", description: "Text: turned on the surface in degrees, -180 to 180, counterclockwise seen from outside. Default 0." },
        textVertical: { type: "boolean", description: "Text: true stacks the letters top to bottom instead of side by side. Default false." },
        carbonWeave: { type: "string", enum: ["twill22", "twill21", "twill31"], description: "Carbon: twill22 (each band over two crossing bands, then under two: the even diagonal of most carbon parts), twill21 (over two, under one: the upright bands show long, the crossing ones short) or twill31 (over three, under one). Default twill22." },
        carbonCross: { type: "number", description: "Carbon: the crossing bands' width in mm, 0 to 50; 0 (the default) makes them as wide as the upright bands (spacing), another width an uneven weave." },
        seed: { type: "number", description: "Cells, grain, bark and wood: another whole number, 1 to 9999, lays them out anew (wood: another tree, other knots); the same number gives the same pattern. Bricks with brickVary: which bricks lie deeper. Default 1." },
        brickBond: { type: "string", enum: ["running", "stack", "english", "englishCross", "flemish"], description: "Bricks: running (every course half a brick along), stack (the joints in one line), english (courses of stretchers and of headers, half as long, in turn), englishCross (as english, every other course of stretchers half a brick along) or flemish (stretchers and headers in turn in every course). Default running." },
        brickHeight: { type: "number", description: "Bricks: a course's height in mm from joint to joint, 0.5 to 100, fitted to the height the texture covers. Default 4." },
        brickJoint: { type: "number", description: "Bricks: the joint's width in mm, 0.1 to 10 (at most 90 % of the shortest brick or the course). Default 0.8." },
        brickVary: { type: "number", description: "Bricks: how unevenly they lie, 0 to 1 - at 1 a brick sinks by up to half the depth, each its own way (seed). Default 0." },
        barkType: { type: "string", enum: ["oak", "pine", "spruce", "birch", "beech"], description: "Bark: oak (deep furrows between rounded ridges joining into a net), pine (plates in flaky layers), spruce (small scales like shingles), birch (smooth, crosswise lenticels, peeling lines) or beech (smooth, gentle waves, chevrons under branch scars). Each starts at its own size and depth: oak 8 and 1.5 mm, pine 12 and 1.5, spruce 5 and 0.8, birch 10 and 0.6, beech 16 and 0.5. Default oak." },
        woodType: { type: "string", enum: ["oak", "ash", "beech", "pine", "walnut"], description: "Wood: oak (ring-porous, large rays), ash (ring-porous), beech (even, small rays as flecks), pine (hard latewood bands) or walnut (soft, wavy). Default oak." },
        woodCut: { type: "string", enum: ["log", "flatSawn", "quarterSawn"], description: "Wood: log (the pith up the body's axis: rings on its ends, the grain of a log without bark on its sides), flatSawn (the pith under the body along its longest side: arches on the wide faces) or quarterSawn (beside it: straight lines, oak's rays as flecks). Default log." },
        ringWidth: { type: "number", description: "Wood, and the ends of a log with bark: an annual ring's width in mm, 0.3 to 20 - small for fine grain, large for coarse. Default by wood: oak 3, ash 3.5, beech 2.5, pine 4, walnut 3." },
        woodKnots: { type: "number", description: "Wood: how many knots, 0 to 12; the rings bend round them. Default 0." },
        woodWobble: { type: "number", description: "Wood: how unevenly the tree grew, 0 (even rings) to 1. Default 0.5." },
        image: { type: "string", enum: ["topography", "wood", "woodRift", "guilloche", "terrazzo", "craquelure", "cord", "moire", "mosaic", "folds", "fingerprint", "rosettes", "own"], description: "Image: a ready height map drawn in code (each tiles without a seam), or own for imageOwn. Default topography." },
        imageOwn: {
          type: "object",
          description: "Image: one's own height map, kept with the design: width and height (2 to 256 each) and data, width × height grey values 0 to 255, a row at a time from the top, as Base64. Light is the full depth.",
          required: ["width", "height", "data"],
          properties: { width: { type: "number" }, height: { type: "number" }, data: { type: "string" } },
        },
        tileHeight: { type: "number", description: "Image: a tile's height in mm, 0 to 200; 0 makes it as high as the image is for the tile's width. Default 0." },
        imageTurn: { type: "number", description: "Image: the tiles turned on the surface in degrees, -180 to 180. Default 0." },
        imageInvert: { type: "boolean", description: "Image: light and dark swapped. Default false." },
        imageBlur: { type: "number", description: "Image: softened over this many of its points, 0 to 8. Default 0." },
        imageTiling: { type: "string", enum: ["repeat", "mirror", "staggered"], description: "Image: tiles repeated, mirrored (no seam at their borders), or every other row half a tile along. Default repeat." },
        faces: {
          type: "array",
          items: {
            anyOf: [
              { type: "string", enum: ["top", "bottom", "front", "back", "left", "right"] },
              { type: "object", properties: { at: { type: "array", items: { type: "number" } }, normal: { type: "array", items: { type: "number" } } } },
            ],
          },
          description: "Only these faces of the body get the pattern; the others stay as they are, with few triangles. A face is the region within the body's sharp edges (edgeAngle): a box's side, a cylinder's mantle or its top. By name: top, bottom, front, back, left, right - the face there (on a cylinder the four sides all name its mantle). Faces picked in the editor are kept as { at, normal } and are taken back as they are. An empty list: every face again. Picked faces go before bottomFree, topFree, the height band, outside and inside. Not for text, which goes where it is put.",
        },
        masks: {
          type: "array",
          description: "Helper bodies that keep the texture away (mode exclude) or are the only place it goes (mode only): other boxes, cylinders, spheres, cones or pyramids that reach into the body, by id. Without this list, the bodies marked as texture masks in the design (surfaceTextureMask) that reach into it take part. A mask is a helper: hide or delete it before printing.",
          items: {
            type: "object",
            required: ["id", "mode"],
            properties: {
              id: { type: "string" },
              mode: { type: "string", enum: ["exclude", "only"] },
            },
          },
        },
      },
    },
  },
  {
    name: "sketchforge_ungroup_objects",
    description: "Ungroup one or more grouped objects by id and preserve their edited geometry.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
        id: { type: "string" },
      },
    },
  },
  {
    name: "sketchforge_boolean_cut",
    description: "Cut solids with hole objects. Provide solidIds and holeIds; the result replaces the operands.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["solidIds", "holeIds"],
      properties: {
        ...editorTargetSchema.properties,
        solidIds: { type: "array", items: { type: "string" } },
        holeIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "sketchforge_separate_parts",
    description: "Separate one disconnected multi-part object into independent objects.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string" },
      },
    },
  },
  {
    name: "sketchforge_list_edges",
    description: "List real CAD edge ids for one object so a later chamfer/fillet can target specific edges.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["id"],
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string" },
        sharpAngle: { type: "number" },
      },
    },
  },
  {
    name: "sketchforge_apply_edge_treatment",
    description: "Apply chamfer or fillet to specific edge ids returned by sketchforge_list_edges.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["id", "kind", "edgeIds", "amount"],
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string" },
        kind: { type: "string", enum: ["chamfer", "fillet"] },
        edgeIds: {
          anyOf: [
            { type: "array", items: { type: "number" } },
            { type: "string", enum: ["all", "top", "vertical"], description: "all: every sharp edge; top: the edges along the very top; vertical: the edges that stand straight up." },
          ],
        },
        allEdges: { type: "boolean" },
        amount: { type: "number" },
        chamferAngle: { type: "number" },
        sharpAngle: { type: "number" },
        quality: { type: "string", enum: ["draft", "standard", "fine"] },
        preserveEdgeSize: { type: "boolean" },
      },
    },
  },
  {
    name: "sketchforge_inspect_errors",
    description: "Inspect the editor notice, last MCP error, and active edge modifier error.",
    inputSchema: editorTargetSchema,
  },
  {
    name: "sketchforge_capture_image",
    description: "Capture a PNG image of the editor viewport from current/home/top/bottom/front/back/right/left view.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        face: { type: "string", enum: ["current", "home", "top", "bottom", "front", "back", "right", "left"] },
      },
    },
  },
];

function bridgeUrl() {
  return new URL(MCP_ROUTE, baseUrl);
}

async function bridgeGet() {
  const response = await fetch(bridgeUrl());
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `SketchForge bridge returned HTTP ${response.status}`);
  }
  return payload;
}

async function bridgeCommand(action, args = {}, defaultTimeoutMs = 15000) {
  const { editorNumber, editorId, timeoutMs, ...params } = args || {};
  let targetNumber = typeof editorNumber === "number" ? editorNumber : undefined;
  let targetId = typeof editorId === "string" ? editorId : undefined;

  if (!targetNumber && !targetId) {
    const { editors = [] } = await bridgeGet();
    if (editors.length === 1) {
      targetNumber = editors[0].editorNumber;
    } else {
      throw new Error(editors.length === 0 ? "No open SketchForge editors found" : "Provide editorNumber because multiple SketchForge editors are open");
    }
  }

  const response = await fetch(bridgeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "command",
      editorNumber: targetNumber,
      editorId: targetId,
      action,
      params,
      timeoutMs: typeof timeoutMs === "number" ? timeoutMs : defaultTimeoutMs,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!payload?.ok) {
    throw new Error(payload?.error || `SketchForge command failed with HTTP ${response.status}`);
  }
  return payload.data;
}

async function callTool(name, args) {
  switch (name) {
    case "sketchforge_list_editors":
      return bridgeGet();
    case "sketchforge_read_scene":
      return bridgeCommand("get_scene", args);
    case "sketchforge_list_objects":
      return bridgeCommand("list_objects", args);
    case "sketchforge_select_objects":
      return bridgeCommand("select_objects", args);
    case "sketchforge_delete_objects":
      return bridgeCommand("delete_objects", args);
    case "sketchforge_create_shape":
      return bridgeCommand("create_shape", args);
    case "sketchforge_import_mesh":
      return bridgeCommand("import_mesh", args, 60000);
    case "sketchforge_update_object":
      return bridgeCommand("update_object", args);
    case "sketchforge_align_objects":
      return bridgeCommand("align_objects", args);
    case "sketchforge_group_objects":
      return bridgeCommand("group_objects", args, 30000);
    case "sketchforge_hull_objects":
      return bridgeCommand("hull_objects", args, 30000);
    case "sketchforge_texture_surface":
      return bridgeCommand("texture_surface", args, 120000);
    case "sketchforge_ungroup_objects":
      return bridgeCommand("ungroup_objects", args);
    case "sketchforge_boolean_cut":
      return bridgeCommand("boolean_cut", args, 45000);
    case "sketchforge_separate_parts":
      return bridgeCommand("separate_parts", args);
    case "sketchforge_list_edges":
      return bridgeCommand("list_edges", args, 30000);
    case "sketchforge_apply_edge_treatment":
      return bridgeCommand("apply_edge_treatment", args, 60000);
    case "sketchforge_inspect_errors":
      return bridgeCommand("inspect_errors", args);
    case "sketchforge_capture_image":
      return bridgeCommand("capture_image", args, 30000);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function textContent(value) {
  return {
    type: "text",
    text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
  };
}

function toolResult(value) {
  if (value?.dataUrl?.startsWith?.("data:image/png;base64,")) {
    return {
      content: [
        textContent({ face: value.face, bytesApprox: value.bytesApprox }),
        {
          type: "image",
          data: value.dataUrl.slice("data:image/png;base64,".length),
          mimeType: "image/png",
        },
      ],
    };
  }
  return { content: [textContent(value)] };
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  const { id, method, params } = message;
  // Ohne id ist das eine Benachrichtigung, und auf die darf nach JSON-RPC
  // ueberhaupt nicht geantwortet werden. Bisher fingen wir nur
  // "notifications/initialized" ab; alles andere - etwa
  // "notifications/cancelled" - lief bis zur Fehlerantwort durch, und die trug
  // dann eine leere id.
  if (id === undefined || id === null) return;
  try {
    if (method === "initialize") {
      sendResult(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "sketchforge-mcp", version: "0.1.0" },
      });
      return;
    }
    if (method === "ping") {
      sendResult(id, {});
      return;
    }
    if (method === "tools/list") {
      sendResult(id, { tools });
      return;
    }
    if (method === "tools/call") {
      const name = params?.name;
      if (typeof name !== "string") {
        sendError(id, -32602, "Expected tool name");
        return;
      }
      const result = await callTool(name, params?.arguments || {});
      sendResult(id, toolResult(result));
      return;
    }
    if (method === "resources/list") {
      sendResult(id, { resources: [] });
      return;
    }
    sendError(id, -32601, `Unknown method: ${method}`);
  } catch (error) {
    if (method === "tools/call") {
      sendResult(id, { isError: true, content: [textContent(error instanceof Error ? error.message : String(error))] });
      return;
    }
    sendError(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      void handleMessage(JSON.parse(trimmed));
    } catch (error) {
      sendError(null, -32700, error instanceof Error ? error.message : String(error));
    }
  });
});
