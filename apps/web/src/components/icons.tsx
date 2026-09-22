import type { CSSProperties, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
type SpriteRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const toolbarSprite = "assets/sketchforge/toolbar-sprite.svg?v=2";
const vectorToolbarSprite = "assets/sketchforge/vector-toolbar-icons.svg?v=1";

function ToolbarSpriteIcon({ rect, className, style }: IconProps & { rect: SpriteRect }) {
  const size = 35;
  const scale = size / rect.height;

  return (
    <span
      aria-hidden="true"
      className={["toolbar-sprite-icon", className].filter(Boolean).join(" ")}
      style={
        {
          "--sprite-x": `${-rect.x * scale}px`,
          "--sprite-y": `${-rect.y * scale}px`,
          "--sprite-width": `${260 * scale}px`,
          "--sprite-height": `${80 * scale}px`,
          width: `${rect.width * scale}px`,
          height: `${size}px`,
          backgroundImage: `url(${toolbarSprite})`,
          ...(style as CSSProperties),
        } as CSSProperties
      }
    />
  );
}

function VectorToolbarSpriteIcon({ rect, className, style }: IconProps & { rect: SpriteRect }) {
  const size = 35;
  const scale = size / rect.height;

  return (
    <span
      aria-hidden="true"
      className={["vector-toolbar-sprite-icon", className].filter(Boolean).join(" ")}
      style={
        {
          "--vector-sprite-x": `${-rect.x * scale}px`,
          "--vector-sprite-y": `${-rect.y * scale}px`,
          "--vector-sprite-width": `${165 * scale}px`,
          "--vector-sprite-height": `${27 * scale}px`,
          width: `${rect.width * scale}px`,
          height: `${size}px`,
          backgroundImage: `url(${vectorToolbarSprite})`,
          ...(style as CSSProperties),
        } as CSSProperties
      }
    />
  );
}

type ToolbarCommandImageProps = { file: string; className?: string };

function ToolbarCommandImage({ file, className }: ToolbarCommandImageProps) {
  const assetClassName = `toolbar-art-${file.replace(/\.png$/i, "")}`;
  return <img aria-hidden="true" className={["toolbar-command-icon", assetClassName, className].filter(Boolean).join(" ")} src={"/assets/sketchforge/" + file} alt="" draggable={false} />;
}

export function ToolbarHomeIcon() {
  return <ToolbarCommandImage file="toolbar-home.png" className="toolbar-user-art-icon" />;
}

export function ToolbarCopyIcon() {
  return <ToolbarCommandImage file="toolbar-copy.png" className="toolbar-user-art-icon" />;
}

export function ToolbarPasteIcon() {
  return <ToolbarCommandImage file="toolbar-paste.png" className="toolbar-user-art-icon" />;
}

export function ToolbarDuplicateIcon() {
  return <ToolbarCommandImage file="toolbar-duplicate.png" className="toolbar-user-art-icon" />;
}

export function ToolbarTrashIcon() {
  return <ToolbarCommandImage file="toolbar-delete.png" className="toolbar-user-art-icon" />;
}

export function ToolbarUndoIcon() {
  return <ToolbarCommandImage file="toolbar-undo.png" className="toolbar-user-art-icon" />;
}

export function ToolbarRedoIcon() {
  return <ToolbarCommandImage file="toolbar-redo.png" className="toolbar-user-art-icon" />;
}

export function ToolbarImportIcon() {
  return <ToolbarCommandImage file="toolbar-import.png" className="toolbar-user-art-icon" />;
}

export function ToolbarVectorExportIcon() {
  return <ToolbarCommandImage file="toolbar-export.png" className="toolbar-user-art-icon" />;
}

export function ToolbarSettingsIcon() {
  return <ToolbarCommandImage file="toolbar-settings.png" className="toolbar-user-art-icon" />;
}

export function ToolbarShapeAddIcon(props: IconProps) {
  return <VectorToolbarSpriteIcon rect={{ x: 104, y: 0, width: 29, height: 27 }} {...props} />;
}

export function ToolbarHideSelectedIcon(props: IconProps) {
  return <VectorToolbarSpriteIcon rect={{ x: 138, y: 0, width: 27, height: 27 }} {...props} />;
}

export function ToolbarCaretDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path d="m16 19 8 9 8-9z" fill="currentColor" />
    </svg>
  );
}

export function ToolbarGroupIcon() {
  return <ToolbarCommandImage file="toolbar-group.png" />;
}

export function ToolbarUngroupIcon() {
  return <ToolbarCommandImage file="toolbar-ungroup.png" />;
}

export function ToolbarIntersectionIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <circle cx="19" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="29" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="4 3" />
      <path d="M24 11.99A13 13 0 0 1 24 36.01A13 13 0 0 1 24 11.99Z" fill="currentColor" opacity="0.82" />
    </svg>
  );
}

export function ToolbarAlignIcon(props: IconProps) {
  return <ToolbarSpriteIcon rect={{ x: 97.3, y: 46.7, width: 29.1, height: 32.5 }} {...props} />;
}

export function ToolbarMirrorIcon() {
  return <ToolbarCommandImage file="toolbar-mirror.png" className="toolbar-user-art-icon" />;
}

export function ToolbarChamferIcon() {
  return <ToolbarCommandImage file="toolbar-chamfer.png" className="toolbar-user-art-icon" />;
}

export function ToolbarFilletIcon() {
  return <ToolbarCommandImage file="toolbar-fillet.png" className="toolbar-user-art-icon" />;
}

export function ToolbarVariableFilletIcon(props: IconProps) {
  // Ecke, deren Verrundung von unten (gross) nach oben (klein) auslaeuft -
  // die Kernaussage des variablen Radius in einem Bild.
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path d="M12 8v26h26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
      <path d="M12 8c0 3 .6 5.4 1.8 7.2" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M38 34c-8 0-14-2-18-6.5S13.4 16 13.8 15.2" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M13 12h6M13 12l2-2M13 12l2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
      <path d="M31 34v-9M31 34l-2-2M31 34l2-2M31 25l-2 2M31 25l2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
    </svg>
  );
}

export function ToolbarPreserveEdgeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path d="M10 35V17c0-4 3-7 7-7h18" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
      <path d="M10 35h25V10" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinejoin="round" />
      <path d="M17 29h13M17 25v8M30 25v8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 17a7 7 0 0 1 7-7" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function ToolbarSnapGridIcon() {
  return <ToolbarCommandImage file="toolbar-snap-grid.png" className="toolbar-user-art-icon" />;
}

export function ToolbarExportIcon() {
  return <ToolbarCommandImage file="toolbar-export.png" className="toolbar-user-art-icon" />;
}

export function ToolbarWorkplaneIcon() {
  return <ToolbarCommandImage file="toolbar-workplane.png" className="toolbar-user-art-icon" />;
}

export function ToolbarDropToWorkplaneIcon() {
  return <ToolbarCommandImage file="toolbar-drop-workplane.png" className="toolbar-user-art-icon" />;
}

/**
 * Centre on the workplane: the plate with the object in its middle, and four
 * arrows pushing it there from every side. Drawn rather than taken from the
 * sprite sheet - the sheet has no such icon, and one drawn in the sprite's
 * proportions sits beside the others without standing out.
 */
export function ToolbarCenterOnWorkplaneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" {...props}>
      <rect x="5" y="5" width="38" height="38" rx="4" />
      <rect x="18" y="18" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
      <path d="M20 9h8l-4 5Z M20 39h8l-4-5Z M9 20v8l5-4Z M39 20v8l-5-4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * An der Arbeitsebene ausrichten: eine gekippte Ebene, und darauf liegt der
 * Koerper flach - im Gegensatz zum Zentrieren, wo die Ebene waagerecht bleibt.
 */
export function ToolbarAlignToWorkplaneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" {...props}>
      <path d="M4 34 20 12h24L28 34Z" />
      <path d="M17 27 25 17h11l-8 10Z" fill="currentColor" stroke="none" />
      <path d="M24 44v-6M21 41l3 3 3-3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * SVG-Zeichnung einlesen: ein Blatt mit einem Linienzug darauf und dem Pfeil
 * hinein. Gezeichnet statt aus der Bilderreihe, weil es dort kein Bildchen
 * dafuer gibt.
 */
export function SketchImportSvgIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" {...props}>
      <path d="M12 6h16l8 8v28H12Z" />
      <path d="M28 6v8h8" />
      <path d="M17 34c3-10 5-14 7-14s4 4 7 14" />
      <circle cx="17" cy="34" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="31" cy="34" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="24" cy="20" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/*
 * Vier Formen fuer das Skizzenmenue, die es bei lucide nicht gibt. Sie sind
 * bewusst in dessen Masszahlen gezeichnet - 24er Feld, Strichstaerke 2, runde
 * Enden -, damit sie neben Rechteck, Kreis und Dreieck nicht auffallen.
 */
function SketchShapeIcon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SketchEllipseIcon(props: IconProps) {
  return (
    <SketchShapeIcon {...props}>
      <ellipse cx="12" cy="12" rx="9" ry="5.5" />
    </SketchShapeIcon>
  );
}

export function SketchHalfCircleIcon(props: IconProps) {
  return (
    <SketchShapeIcon {...props}>
      {/* Bogen von links nach rechts, die Sehne schliesst ihn - genau der
          Umriss, den die Form in der Skizze bekommt. */}
      <path d="M3 15a9 9 0 0 1 18 0Z" />
    </SketchShapeIcon>
  );
}

export function SketchPieSliceIcon(props: IconProps) {
  return (
    <SketchShapeIcon {...props}>
      {/* Die Spitze sitzt unten links, der Bogen spannt sich darueber - so
          fuellt das Viertel das Feld, statt als Eckchen darin zu sitzen. */}
      <path d="M5 5a14 14 0 0 1 14 14H5Z" />
    </SketchShapeIcon>
  );
}

export function SketchBoltCircleIcon(props: IconProps) {
  return (
    <SketchShapeIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      {/* Vier statt sechs Bohrungen: In einem 24er Feld waeren sechs nur noch
          ein Kranz aus Punkten, der nichts mehr erkennen laesst. */}
      <circle cx="12" cy="6.6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17.4" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </SketchShapeIcon>
  );
}
