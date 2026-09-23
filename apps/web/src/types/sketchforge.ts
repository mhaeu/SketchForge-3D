export type ShapeKind =
  | "box"
  | "roundedBox"
  | "honeycomb"
  | "cylinder"
  | "ellipse"
  | "sphere"
  | "sketch"
  | "scribble"
  | "cone"
  | "pyramid"
  | "roof"
  | "text"
  | "roundRoof"
  | "halfSphere"
  | "torus"
  | "tube"
  | "gear"
  | "thread"
  | "spring"
  | "ruler"
  | "ring"
  | "wedge"
  | "polygon"
  | "icosahedron"
  | "mesh"
  | "reference"
  | "loft";

/** Was fuer ein Koerper das Gewinde ist - Stange, Schraube, Gewindestift, Mutter, Loch. */
export type ThreadRole = "rod" | "screw" | "setScrew" | "nut" | "bore";
/** Die Kopfform der Schraube: Zylinder-, Linsen-, Senk- oder Sechskantkopf. */
export type ThreadHead = "cylinder" | "pan" | "countersunk" | "hex";
/** Der Angriff im Kopf: Innensechskant, Schlitz, Kreuz, Torx, Stern, Innenvielzahn. */
export type ThreadDrive = "none" | "hex" | "slot" | "phillips" | "pozidriv" | "torx" | "star" | "spline";
/** Die Gangrichtung. */
export type ThreadHand = "right" | "left";
/** Das Gewindeprofil im Querschnitt. */
export type ThreadProfile = "v" | "trapezoidal" | "round";

export type ShapeAsset = {
  id: string;
  name: string;
  src: string;
  kind: ShapeKind;
  color: string;
  hole?: boolean;
};

export type ProjectAssetSourceFormat = "stl" | "obj" | "svg" | "step";

export type ProjectAsset = {
  id: string;
  name: string;
  mediaType: string;
  sourceFormat: ProjectAssetSourceFormat;
  bytes: Uint8Array;
  byteLength: number;
  sha256: string;
};

export type GridSize = "Off" | "0.1 mm" | "0.25 mm" | "0.5 mm" | "1.0 mm" | "2.0 mm" | "5.0 mm" | "Brick";
export type MeasurementAccuracy = 1 | 2 | 3;
export type HistoryRetentionLimit = "unlimited" | number;

export type ShapeCustomization = {
  width?: number;
  cornerFillet?: number;
  topBottomFillet?: number;
  roundedBoxQuality?: number;
  honeycombCellSize?: number;
  honeycombWallThickness?: number;
  honeycombFrameWidth?: number;
  depth?: number;
  height?: number;
  maxDimension?: number;
  steps?: number;
  sides?: number;
  bevel?: number;
  segments?: number;
  topRadius?: number;
  /** Pyramide: Deckflaeche statt Spitze. Null heisst Spitze. */
  topWidth?: number;
  topDepth?: number;
  baseRadius?: number;
  teeth?: number;
  toothSize?: number;
  toothWidth?: number;
  centerHoleSize?: number;
  gearType?: GearType;
  helixAngle?: number;
  helixQuality?: number;
  threadRole?: ThreadRole;
  threadHead?: ThreadHead;
  threadDrive?: ThreadDrive;
  threadHand?: ThreadHand;
  threadProfile?: ThreadProfile;
  threadDiameter?: number;
  threadPitch?: number;
  threadClearance?: number;
  threadQuality?: number;
  springTurns?: number;
  springWire?: number;
  springQuality?: number;
  text?: string;
  font?: string;
};

export type ShapeCustomizationMap = Partial<Record<ShapeKind, ShapeCustomization>>;

export type WorkplaneWorkspaceSettings = {
  width: number;
  depth: number;
  sizePreset: string;
  gridBlockSize: number;
  gridBlockPreset: string;
  gridColor: string;
  background: string;
  showShadows: boolean;
  showGrid: boolean;
  cruiseShapes: boolean;
  selectBeforeMove: boolean;
  zoomSpeed: number;
  units: string;
  scale: string;
  accuracy: MeasurementAccuracy;
  historyLimit: HistoryRetentionLimit;
  shapeCustomizations: ShapeCustomizationMap;
};

export type AlignAxis = "x" | "y" | "z";
export type AlignTarget = "min" | "center" | "max";
export type AlignHandleStatus = {
  axis: AlignAxis;
  target: AlignTarget;
  disabled: boolean;
  aligned: boolean;
  title: string;
};

export type SketchPoint = {
  id: string;
  x: number;
  z: number;
  handleIn?: { x: number; z: number };
  handleOut?: { x: number; z: number };
  mode?: "corner" | "smooth" | "split";
};

export type SketchSegment = {
  id: string;
  startId: string;
  endId: string;
  kind?: "line" | "bezier" | "smooth" | "arc";
  /**
   * Nur beim Bogen: seine Hoehe ueber der Sehne, mit Vorzeichen, in Richtung
   * der um 90 Grad gedrehten Kante von `startId` nach `endId`. Mehr braucht
   * ein Kreisbogen nicht - er haengt an seinen beiden Punkten, und nur die
   * Woelbung laesst sich aendern.
   */
  bulge?: number;
  /**
   * Beim Folgen: Diese Kante gehoert zum Weg und nicht zur Form.
   *
   * Ohne Auszeichnung entscheidet die Zeichnung selbst - ein offener Zug ist
   * der Weg, und wo alles geschlossen ist, der weiteste Ring. Das trifft es
   * meistens, aber nicht immer: Eine Form, die *innerhalb* des Weges liegt,
   * laese sich sonst nur als Loch im Weg lesen. Wer es festlegt, hat recht.
   */
  role?: "path";
};

export type SketchCircle = {
  id: string;
  x: number;
  z: number;
  radius: number;
};

export type SketchImage = {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  pixelWidth: number;
  pixelHeight: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  opacity?: number;
  lockAspect?: boolean;
  locked?: boolean;
};

export type SketchProfile = {
  points: SketchPoint[];
  segments: SketchSegment[];
  images?: SketchImage[];
  /** Echte Kreise - sie werden erst beim Bauen zu Punkten und Kanten. */
  circles?: SketchCircle[];
};

/** Was aus der Zeichnung wird: hochziehen, um eine Achse drehen, oder einem Pfad folgen. */
export type SketchOperation = "extrude" | "revolve" | "sweep";

export type GearType = "spur" | "helical" | "bevel";

export type LoftProfileShape = "Oval" | "Rectangle" | "Triangle" | "Pentagon" | "Hexagon";

export type SketchRevolveSettings = {
  startAngle: number;
  sweepAngle: number;
  sides: number;
  quality: number;
};

export type EdgeTreatmentFeature = {
  kind: "fillet" | "chamfer" | "variableFillet";
  amount: number;
  edgeCount: number;
  chamferAngle?: number;
  /** variableFillet only: radius at the edge end. `amount` applies at the start. */
  endAmount?: number;
  /** variableFillet only: swaps the start and end radius. */
  flipTaper?: boolean;
};

export type EdgeTreatmentHistoryEntry = {
  id: string;
  createdAt: number;
  feature: EdgeTreatmentFeature;
  before: WorkplaneShape;
  appliedFrame?: {
    x: number;
    z: number;
    elevation: number;
    width: number;
    depth: number;
    height: number;
    rotation: number;
    rotationX: number;
    rotationZ: number;
    mirrorX: boolean;
    mirrorY: boolean;
    mirrorZ: boolean;
  };
};

export type CadDisplayEdge = {
  points: number[];
};

export type CadBrepFrame = {
  x: number;
  z: number;
  elevation: number;
  width: number;
  depth: number;
  height: number;
  sourceTransform?: number[];
};

/**
 * Was ein Koerper war, bevor eine Drehung ihn in ein Netz gebacken hat.
 *
 * Gedreht wird um die Mitte des Rahmens, und danach muss der Rahmen neu
 * aufgesetzt werden - sonst sinkt ein gekippter Koerper durch die
 * Arbeitsebene. Genau dafuer backt der Editor ihn in ein Netz. Seine Bauwerte
 * (Durchmesser, Zahnzahl, Steigung ...) bleiben dabei am Datensatz stehen;
 * hier steht nur, was das Backen ueberschrieben hat - samt der aufgelaufenen
 * Drehung. Zusammen reicht das, um den Koerper neu zu bauen, wieder zu drehen
 * und wieder zu backen, und um im Drehfeld den Winkel zu zeigen, unter dem er
 * wirklich steht statt einer Null.
 */
export type ParametricSource = {
  kind: ShapeKind;
  width: number;
  depth: number;
  height: number;
  size: number;
  /** Die aufgelaufene Drehung in Grad, so wie sie wieder aufzutragen ist. */
  rotation: number;
  rotationX: number;
  rotationZ: number;
  taperTopWidth?: number;
  taperTopDepth?: number;
  taperBottomWidth?: number;
  taperBottomDepth?: number;
  extrudeTwist?: number;
  extrudeTopOffsetX?: number;
  extrudeTopOffsetZ?: number;
  /** Abgerundeter Quader: die vier aufrechten Kanten, in mm. */
  cornerFillet?: number;
  /** Abgerundeter Quader: die Kanten an Deckel und Boden, in mm. */
  topBottomFillet?: number;
  /** Abgerundeter Quader: wie fein die Rundungen unterteilt werden. */
  roundedBoxQuality?: number;
  /** Wabengitter: Schluesselweite einer Wabe, Breite der Stege, Breite des Rahmens - in mm. */
  honeycombCellSize?: number;
  honeycombWallThickness?: number;
  honeycombFrameWidth?: number;
  taperHeightLeft?: number;
  taperHeightRight?: number;
  taperHeightFront?: number;
  taperHeightBack?: number;
};

export type CadPrimitiveFrame = {
  kind: "box";
  width: number;
  depth: number;
  height: number;
  frame: CadBrepFrame;
};

export type ThreadShapeParams = {
  /** Nominal diameter in mm (8 = M8). */
  diameter: number;
  /** Pitch in mm. */
  pitch: number;
  /** Thread length in mm. */
  length: number;
  /** "external" = bolt, "internal" = cutter body for a tapped hole. */
  kind: "external" | "internal";
  /** Manufacturing clearance in mm. */
  clearance: number;
  /** Circumferential segments per turn. */
  segments: number;
  /** Lead-in/out in turns. */
  taperTurns: number;
};

export type WorkplaneShape = {
  id: string;
  name: string;
  kind: ShapeKind;
  color: string;
  /**
   * Viewport-only see-through, 0..1, absent meaning fully opaque. No export
   * format carries it: STL has no material at all, STEP only colours.
   */
  opacity?: number;
  hole?: boolean;
  x: number;
  z: number;
  elevation?: number;
  size: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  rotationX?: number;
  rotationZ?: number;
  mirrorX?: boolean;
  mirrorY?: boolean;
  mirrorZ?: boolean;
  radius?: number;
  steps?: number;
  sides?: number;
  bevel?: number;
  segments?: number;
  topRadius?: number;
  /** Pyramide: Deckflaeche statt Spitze. Null heisst Spitze. */
  topWidth?: number;
  topDepth?: number;
  baseRadius?: number;
  taperTopWidth?: number;
  taperTopDepth?: number;
  taperBottomWidth?: number;
  taperBottomDepth?: number;
  /** Legacy local-dev taper fields kept for compatibility with in-progress projects. */
  taperTopScale?: number;
  taperBottomScale?: number;
  /** Dreht die Deckflaeche gegen die Grundflaeche, in Grad - der Drall. */
  extrudeTwist?: number;
  /** Schiebt die Deckflaeche entlang der eigenen X-Achse, in mm. */
  extrudeTopOffsetX?: number;
  /** Schiebt die Deckflaeche entlang der eigenen Z-Achse, in mm. */
  extrudeTopOffsetZ?: number;
  /** Abgerundeter Quader: die vier aufrechten Kanten, in mm. */
  cornerFillet?: number;
  /** Abgerundeter Quader: die Kanten an Deckel und Boden, in mm. */
  topBottomFillet?: number;
  /** Abgerundeter Quader: wie fein die Rundungen unterteilt werden. */
  roundedBoxQuality?: number;
  /** Wabengitter: Schluesselweite einer Wabe, Breite der Stege, Breite des Rahmens - in mm. */
  honeycombCellSize?: number;
  honeycombWallThickness?: number;
  honeycombFrameWidth?: number;
  /**
   * Die Hoehe an den vier Seiten, als Anteil der Hoehe des Koerpers (0 bis 1).
   * Damit wird aus dem Koerper ein Keil oder eine schiefe Ebene. Fehlt ein
   * Wert, steht die Seite auf voller Hoehe.
   *
   * Als Anteil und nicht in Millimetern, damit die Neigung erhalten bleibt,
   * wenn der Koerper hoeher oder niedriger gezogen wird - ein Mass in
   * Millimetern muesste dabei mitgerechnet werden und ginge beim Verkleinern
   * verloren. Das Merkmalsfeld zeigt trotzdem Millimeter.
   *
   * Abgesenkt wird nur: Die Hoehe des Koerpers bleibt seine Hoehe, und die
   * Seiten liegen darunter. Sonst muesste jede Stelle, die mit `height`
   * rechnet - Auswahlrahmen, Aufstellhoehe, Teilbereich, Ausfuhr - die
   * Verjuengung mitdenken.
   */
  taperHeightLeft?: number;
  taperHeightRight?: number;
  taperHeightFront?: number;
  taperHeightBack?: number;
  teeth?: number;
  toothSize?: number;
  toothWidth?: number;
  centerHoleSize?: number;
  gearType?: GearType;
  helixAngle?: number;
  helixQuality?: number;
  threadRole?: ThreadRole;
  threadHead?: ThreadHead;
  threadDrive?: ThreadDrive;
  threadHand?: ThreadHand;
  threadProfile?: ThreadProfile;
  threadDiameter?: number;
  threadPitch?: number;
  threadClearance?: number;
  threadQuality?: number;
  threadHeadHeight?: number;
  threadChamfer?: number;
  threadHeadChamfer?: number;
  springTurns?: number;
  springWire?: number;
  springQuality?: number;
  loftBottomShape?: LoftProfileShape;
  loftTopShape?: LoftProfileShape;
  loftTopWidth?: number;
  loftTopDepth?: number;
  loftBottomRotation?: number;
  loftTopRotation?: number;
  loftSegments?: number;
  loftLayers?: number;
  text?: string;
  font?: string;
  importedMesh?: {
    positions: number[];
    normals?: number[];
    baseWidth: number;
    baseDepth: number;
    baseHeight: number;
    triangleCount: number;
    sourceFormat: "stl" | "obj" | "svg" | "json" | "step";
    // IndexedDB persistence uses this only in compact stored shape records.
    // Runtime editor shapes are hydrated with the full immutable mesh resource.
    storageResourceId?: string;
    // Stable reference to the original imported file in the project's shared
    // asset table. Copies and grouped operands reuse this reference.
    assetId?: string;
    // Exact OpenCascade B-Rep of the body (single-shape STEP text) in the same
    // local frame as `positions`. Set only for STEP imports; lets the exporter
    // re-emit the original analytic geometry instead of the tessellation.
    brepStep?: string;
  };
  imagePlate?: {
    dataUrl: string;
    mimeType: string;
    pixelWidth: number;
    pixelHeight: number;
  };
  parametricSource?: ParametricSource;
  /**
   * Der Winkel, unter dem ein gebackener Koerper wirklich steht.
   *
   * Beim Backen wandert die Drehung in die Punkte des Netzes und `rotation`
   * steht wieder auf null. Ein Koerper mit parametrischem Ursprung fuehrt sie
   * dort mit; einer ohne - ein Skizzen- oder Rotationskoerper, ein
   * eingelesenes Netz - hatte danach gar kein Gedaechtnis mehr: Der
   * Winkelzaehler fing wieder bei null an, und nichts konnte ihn wieder
   * gerade stellen.
   */
  bakedRotation?: { rotation: number; rotationX: number; rotationZ: number };

  sketchProfile?: SketchProfile;
  sketchOperation?: SketchOperation;
  sketchRevolve?: SketchRevolveSettings;
  // Parametric thread. Set when the mesh was produced in lib/threadGenerator.ts;
  // allows rebuilding later instead of merely scaling.
  threadParams?: ThreadShapeParams;
  // Reference-point cross dimensions in millimeters. Only used for
  // kind: "reference"; let the on-screen cross and marker be resized without
  // touching the width/height/depth used by real geometry.
  crossArm?: number;
  markerRadius?: number;
  edgeTreatments?: EdgeTreatmentFeature[];
  edgeTreatmentHistory?: EdgeTreatmentHistoryEntry[];
  cadDisplayEdges?: CadDisplayEdge[];
  cadDisplayEdgesVersion?: 2;
  edgeResizeMode?: "scale" | "preserve";
  cadBrep?: string;
  cadBrepFrame?: CadBrepFrame;
  // Die feinste Vernetzung, die eine Kantenbearbeitung dieses Koerpers bisher
  // gebraucht hat. Sie wird als Untergrenze weitergetragen, damit eine spaetere
  // Verrundung mit groesserem Halbmesser eine schon fein gerundete Stelle nicht
  // groeber nachvernetzt.
  cadMeshDeflection?: { linear: number; angular: number };
  cadPrimitiveFrame?: CadPrimitiveFrame;
  groupedShapes?: WorkplaneShape[];
  groupedBaseWidth?: number;
  groupedBaseDepth?: number;
  groupedBaseHeight?: number;
  groupOperation?: "group" | "intersection";
  locked?: boolean;
  hidden?: boolean;
};

/**
 * Woran eine Notiz haengt, wenn sie nicht frei auf der Arbeitsebene steht: an
 * einem Koerper, und zwar an einer Stelle seines Rahmens statt an einer
 * Weltkoordinate. So faehrt sie mit, wenn der Koerper verschoben, gedreht oder
 * in der Groesse geaendert wird - dieselbe Rechnung wie beim Lineal.
 */
export type WorkplaneNoteAnchor = {
  shapeId: string;
  normalized: [number, number, number];
};

/**
 * Eine Notiz auf der Arbeitsflaeche. Sie ist kein Koerper: Sie wird nicht
 * gedruckt, taucht in keiner Ausfuhr auf und traegt keine Geometrie - nur einen
 * Text und die Stelle, an der er steht.
 */
export type WorkplaneNote = {
  id: string;
  text: string;
  /** Weltkoordinate. Bei einer angehefteten Notiz die zuletzt bekannte Lage. */
  x: number;
  y: number;
  z: number;
  anchor?: WorkplaneNoteAnchor;
  /** Zugeklappt zeigt die Notiz nur ihre Nadel mit der Nummer. */
  collapsed?: boolean;
};
