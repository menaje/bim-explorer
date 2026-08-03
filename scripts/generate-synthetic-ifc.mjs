import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IFC_GUID_CHARACTERS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

function globalId(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 4096) {
    throw new RangeError("synthetic GlobalId index is out of range");
  }
  const high = IFC_GUID_CHARACTERS[Math.floor(index / 64)];
  const low = IFC_GUID_CHARACTERS[index % 64];
  return `0${"A".repeat(19)}${high}${low}`;
}

function assertGlobalId(value) {
  if (
    value.length !== 22 ||
    !/^[0-3][0-9A-Za-z_$]{21}$/u.test(value)
  ) {
    throw new Error(`invalid synthetic IFC GlobalId ${value}`);
  }
  return value;
}

const gids = Object.freeze(
  Object.fromEntries(
    [
      "project",
      "site",
      "building",
      "storey",
      "space",
      "wall",
      "aggregateProjectSite",
      "aggregateSiteBuilding",
      "aggregateBuildingStorey",
      "aggregateStoreySpace",
      "containWall",
      "propertySetOccurrence",
      "propertyRelation",
      "propertySetType",
      "wallType",
      "typeRelation",
      "materialRelation",
    ].map((name, index) => [
      name,
      assertGlobalId(globalId(index + 1)),
    ]),
  ),
);

export function syntheticIfc() {
  const lines = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    "FILE_NAME('synthetic-small.ifc','2026-08-03T00:00:00',('BIM Explorer'),(''),'BIM Explorer fixture generator','BIM Explorer','');",
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    "#1=IFCPERSON($,$,'BIM Explorer',$,$,$,$,$);",
    "#2=IFCORGANIZATION($,'BIM Explorer',$,$,$);",
    "#3=IFCPERSONANDORGANIZATION(#1,#2,$);",
    "#4=IFCAPPLICATION(#2,'0.0.0','BIM Explorer Fixture Generator','BIMEXPLORER');",
    "#5=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,1785715200);",
    "#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);",
    "#7=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);",
    "#8=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);",
    "#9=IFCUNITASSIGNMENT((#6,#7,#8));",
    "#10=IFCCARTESIANPOINT((0.,0.,0.));",
    "#11=IFCAXIS2PLACEMENT3D(#10,$,$);",
    "#12=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#11,$);",
    `#13=IFCPROJECT('${gids.project}',#5,'Synthetic Project',$,$,$,$,(#12),#9);`,
    "#14=IFCLOCALPLACEMENT($,#11);",
    `#15=IFCSITE('${gids.site}',#5,'Synthetic Site',$,$,#14,$,$,.ELEMENT.,$,$,$,$,$);`,
    "#16=IFCLOCALPLACEMENT(#14,#11);",
    `#17=IFCBUILDING('${gids.building}',#5,'Synthetic Building',$,$,#16,$,$,.ELEMENT.,$,$,$);`,
    "#18=IFCLOCALPLACEMENT(#16,#11);",
    `#19=IFCBUILDINGSTOREY('${gids.storey}',#5,'Level 01',$,$,#18,$,$,.ELEMENT.,0.);`,
    "#20=IFCLOCALPLACEMENT(#18,#11);",
    `#21=IFCSPACE('${gids.space}',#5,'Space-01',$,$,#20,$,$,.ELEMENT.,.INTERNAL.,0.);`,
    "#22=IFCCARTESIANPOINT((2.,1.,0.));",
    "#23=IFCAXIS2PLACEMENT3D(#22,$,$);",
    "#24=IFCLOCALPLACEMENT(#18,#23);",
    "#25=IFCCARTESIANPOINT((0.,0.));",
    "#26=IFCAXIS2PLACEMENT2D(#25,$);",
    "#27=IFCRECTANGLEPROFILEDEF(.AREA.,'WallProfile',#26,4.,0.2);",
    "#28=IFCDIRECTION((0.,0.,1.));",
    "#29=IFCEXTRUDEDAREASOLID(#27,#11,#28,3.);",
    "#30=IFCSHAPEREPRESENTATION(#12,'Body','SweptSolid',(#29));",
    "#31=IFCPRODUCTDEFINITIONSHAPE($,$,(#30));",
    `#32=IFCWALL('${gids.wall}',#5,'Wall-01',$,$,#24,#31,'W-01',.STANDARD.);`,
    `#33=IFCRELAGGREGATES('${gids.aggregateProjectSite}',#5,$,$,#13,(#15));`,
    `#34=IFCRELAGGREGATES('${gids.aggregateSiteBuilding}',#5,$,$,#15,(#17));`,
    `#35=IFCRELAGGREGATES('${gids.aggregateBuildingStorey}',#5,$,$,#17,(#19));`,
    `#36=IFCRELAGGREGATES('${gids.aggregateStoreySpace}',#5,$,$,#19,(#21));`,
    `#37=IFCRELCONTAINEDINSPATIALSTRUCTURE('${gids.containWall}',#5,$,$,(#32),#19);`,
    "#38=IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('W-01'),$);",
    `#39=IFCPROPERTYSET('${gids.propertySetOccurrence}',#5,'Pset_WallCommon',$,(#38));`,
    `#40=IFCRELDEFINESBYPROPERTIES('${gids.propertyRelation}',#5,$,$,(#32),#39);`,
    "#41=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('60min'),$);",
    `#42=IFCPROPERTYSET('${gids.propertySetType}',#5,'Pset_WallTypeCommon',$,(#41));`,
    `#43=IFCWALLTYPE('${gids.wallType}',#5,'WallType-01',$,$,(#42),$,$,$,.STANDARD.);`,
    `#44=IFCRELDEFINESBYTYPE('${gids.typeRelation}',#5,$,$,(#32),#43);`,
    "#45=IFCMATERIAL('Concrete',$,'concrete');",
    `#46=IFCRELASSOCIATESMATERIAL('${gids.materialRelation}',#5,$,$,(#32),#45);`,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ];
  return lines.join("\n");
}

function outputArgument(values) {
  if (values.length !== 2 || values[0] !== "--output") {
    throw new TypeError(
      "usage: node scripts/generate-synthetic-ifc.mjs --output <path>",
    );
  }
  return path.resolve(values[1]);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = outputArgument(process.argv.slice(2));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, syntheticIfc(), {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(output);
}
