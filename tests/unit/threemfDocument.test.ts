// Das Zerlegen der XML-Datei braucht einen Browser - wie beim SVG-Import.
// Diese eine Datei laeuft deshalb unter jsdom; die Rechnung darueber steht in
// threemfModel.test.ts und kommt ohne aus.
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { threemfModelFromDocument } from "@/lib/threemfImport";
import { threemfTrianglePositions } from "@/lib/threemfModel";

/**
 * So schreibt ein Slicer die Datei: mit Namensraum auf dem Wurzelelement, mit
 * Bauplatz und mit einer Baugruppe. Der Namensraum ist der Punkt, an dem das
 * Auslesen still scheitern koennte - dann kaeme fuer jede echte Datei "keine
 * lesbare Geometrie" heraus, ohne dass irgendetwas auf die Ursache zeigt.
 */
const SLICER_FILE = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" type="model">
   <mesh>
    <vertices>
     <vertex x="0" y="0" z="0"/>
     <vertex x="10" y="0" z="0"/>
     <vertex x="10" y="20" z="0"/>
     <vertex x="0" y="0" z="30"/>
    </vertices>
    <triangles>
     <triangle v1="0" v2="1" v3="2"/>
     <triangle v1="0" v2="1" v3="3"/>
    </triangles>
   </mesh>
  </object>
  <object id="2" type="model">
   <components>
    <component objectid="1" transform="1 0 0 0 1 0 0 0 1 5 0 0"/>
   </components>
  </object>
  <object id="3" type="support">
   <mesh>
    <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
    <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1"/>
  <item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 0 0"/>
  <item objectid="3"/>
 </build>
</model>`;

function documentFrom(xml: string) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

describe("eine 3MF-Datei auslesen", () => {
  const model = threemfModelFromDocument(documentFrom(SLICER_FILE));

  it("findet die Objekte trotz des Namensraums", () => {
    expect(model.objects.map((object) => object.id)).toEqual(["1", "2", "3"]);
    expect(model.objects[0].mesh?.vertices).toEqual([0, 0, 0, 10, 0, 0, 10, 20, 0, 0, 0, 30]);
    expect(model.objects[0].mesh?.triangles).toEqual([0, 1, 2, 0, 1, 3]);
    expect(model.objects[2].type).toBe("support");
  });

  it("liest eine Baugruppe samt ihrer Lage", () => {
    expect(model.objects[1].mesh).toBeUndefined();
    expect(model.objects[1].components).toEqual([
      { objectId: "1", transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 0, 0] },
    ]);
  });

  it("liest den Bauplatz mit und ohne Lage", () => {
    expect(model.build.map((item) => item.objectId)).toEqual(["1", "2", "3"]);
    expect(model.build[0].transform).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(model.build[1].transform).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 100, 0, 0]);
  });

  it("ergibt zusammen die Dreiecke am richtigen Fleck", () => {
    const positions = threemfTrianglePositions(model);
    // Zwei Dreiecke aus dem Objekt und dieselben zwei aus der Baugruppe - die
    // Stuetze zaehlt nicht mit.
    expect(positions).toHaveLength(4 * 9);
    // Das Objekt steht bei x = 0, die Baugruppe 5 mm weiter und der Bauplatz
    // legt noch 100 mm drauf.
    expect(positions[0] + 0).toBe(0);
    expect(positions[18] + 0).toBe(105);
    // Und die Datei hat Z nach oben, wir Y: der Punkt (0, 0, 30) der Datei
    // liegt bei uns 30 mm hoch.
    // Das ist die dritte Ecke des zweiten Dreiecks der Baugruppe.
    expect(positions.slice(33, 36).map((value) => value + 0)).toEqual([105, 30, 0]);
  });
});

describe("eine Datei, die sich nicht auslesen laesst", () => {
  it("liefert ein leeres Modell statt eines Absturzes", () => {
    const empty = threemfModelFromDocument(documentFrom("<model/>"));
    expect(empty.objects).toEqual([]);
    expect(empty.build).toEqual([]);
  });

  it("nimmt nur, was unter den Betriebsmitteln steht", () => {
    // Die Norm kennt Objekte nur unter <resources>. Was daneben steht, gehoert
    // einem anderen Teil der Datei - es als Material zu nehmen, brachte
    // Geometrie in die Szene, die niemand gebaut hat.
    const model = threemfModelFromDocument(documentFrom(
      `<model>
        <resources><object id="echt" type="model"><mesh/></object></resources>
        <irgendwas><object id="fremd" type="model"><mesh/></object></irgendwas>
      </model>`,
    ));
    expect(model.objects.map((object) => object.id)).toEqual(["echt"]);
  });

  it("uebergeht ein Objekt ohne Kennung und einen Eintrag, der auf nichts zeigt", () => {
    const model = threemfModelFromDocument(documentFrom(
      `<model><resources><object type="model"><mesh/></object></resources><build><item/></build></model>`,
    ));
    expect(model.objects).toEqual([]);
    expect(model.build).toEqual([]);
  });
});
