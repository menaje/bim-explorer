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

function createGlobalIds(names, offset = 1) {
  return Object.freeze(
    Object.fromEntries(
      names.map((name, index) => [
        name,
        assertGlobalId(globalId(index + offset)),
      ]),
    ),
  );
}

const gids = createGlobalIds(
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
  ],
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

const mappedGids = createGlobalIds(
  [
    "project",
    "site",
    "building",
    "storey",
    "space",
    "wall01",
    "wall02",
    "aggregateProjectSite",
    "aggregateSiteBuilding",
    "aggregateBuildingStorey",
    "aggregateStoreySpace",
    "containWalls",
    "propertySetOccurrence",
    "propertyRelation",
    "propertySetType",
    "wallType",
    "typeRelation",
    "materialRelation",
    "elementQuantity",
    "quantityRelation",
    "classificationRelation",
  ],
  65,
);

export function syntheticMappedIfc() {
  const lines = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    "FILE_NAME('synthetic-mapped.ifc','2026-08-03T00:00:00',('BIM Explorer'),(''),'BIM Explorer fixture generator','BIM Explorer','');",
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
    `#13=IFCPROJECT('${mappedGids.project}',#5,'Synthetic Mapped Project',$,$,$,$,(#12),#9);`,
    "#14=IFCLOCALPLACEMENT($,#11);",
    `#15=IFCSITE('${mappedGids.site}',#5,'Synthetic Site',$,$,#14,$,$,.ELEMENT.,$,$,$,$,$);`,
    "#16=IFCLOCALPLACEMENT(#14,#11);",
    `#17=IFCBUILDING('${mappedGids.building}',#5,'Synthetic Building',$,$,#16,$,$,.ELEMENT.,$,$,$);`,
    "#18=IFCLOCALPLACEMENT(#16,#11);",
    `#19=IFCBUILDINGSTOREY('${mappedGids.storey}',#5,'Level 01',$,$,#18,$,$,.ELEMENT.,0.);`,
    "#20=IFCLOCALPLACEMENT(#18,#11);",
    `#21=IFCSPACE('${mappedGids.space}',#5,'Space-01',$,$,#20,$,$,.ELEMENT.,.INTERNAL.,0.);`,
    "#22=IFCCARTESIANPOINT((2.,1.,0.));",
    "#23=IFCAXIS2PLACEMENT3D(#22,$,$);",
    "#24=IFCLOCALPLACEMENT(#18,#23);",
    "#25=IFCCARTESIANPOINT((2.,5.,0.));",
    "#26=IFCAXIS2PLACEMENT3D(#25,$,$);",
    "#27=IFCLOCALPLACEMENT(#18,#26);",
    "#28=IFCCARTESIANPOINT((0.,0.));",
    "#29=IFCAXIS2PLACEMENT2D(#28,$);",
    "#30=IFCRECTANGLEPROFILEDEF(.AREA.,'SharedWallProfile',#29,4.,0.2);",
    "#31=IFCDIRECTION((0.,0.,1.));",
    "#32=IFCEXTRUDEDAREASOLID(#30,#11,#31,3.);",
    "#33=IFCSHAPEREPRESENTATION(#12,'Body','SweptSolid',(#32));",
    "#34=IFCREPRESENTATIONMAP(#11,#33);",
    "#35=IFCCARTESIANPOINT((0.,0.,0.));",
    "#36=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#35,1.,$);",
    "#37=IFCMAPPEDITEM(#34,#36);",
    "#38=IFCSHAPEREPRESENTATION(#12,'Body','MappedRepresentation',(#37));",
    "#39=IFCPRODUCTDEFINITIONSHAPE($,$,(#38));",
    `#40=IFCWALL('${mappedGids.wall01}',#5,'Mapped Wall-01',$,$,#24,#39,'MW-01',.STANDARD.);`,
    "#41=IFCMAPPEDITEM(#34,#36);",
    "#42=IFCSHAPEREPRESENTATION(#12,'Body','MappedRepresentation',(#41));",
    "#43=IFCPRODUCTDEFINITIONSHAPE($,$,(#42));",
    `#44=IFCWALL('${mappedGids.wall02}',#5,'Mapped Wall-02',$,$,#27,#43,'MW-02',.STANDARD.);`,
    `#45=IFCRELAGGREGATES('${mappedGids.aggregateProjectSite}',#5,$,$,#13,(#15));`,
    `#46=IFCRELAGGREGATES('${mappedGids.aggregateSiteBuilding}',#5,$,$,#15,(#17));`,
    `#47=IFCRELAGGREGATES('${mappedGids.aggregateBuildingStorey}',#5,$,$,#17,(#19));`,
    `#48=IFCRELAGGREGATES('${mappedGids.aggregateStoreySpace}',#5,$,$,#19,(#21));`,
    `#49=IFCRELCONTAINEDINSPATIALSTRUCTURE('${mappedGids.containWalls}',#5,$,$,(#40,#44),#19);`,
    "#50=IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('MW-SHARED'),$);",
    `#51=IFCPROPERTYSET('${mappedGids.propertySetOccurrence}',#5,'Pset_WallCommon',$,(#50));`,
    `#52=IFCRELDEFINESBYPROPERTIES('${mappedGids.propertyRelation}',#5,$,$,(#40,#44),#51);`,
    "#53=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('90min'),$);",
    `#54=IFCPROPERTYSET('${mappedGids.propertySetType}',#5,'Pset_WallTypeCommon',$,(#53));`,
    `#55=IFCWALLTYPE('${mappedGids.wallType}',#5,'MappedWallType-01',$,$,(#54),(#34),$,$,.STANDARD.);`,
    `#56=IFCRELDEFINESBYTYPE('${mappedGids.typeRelation}',#5,$,$,(#40,#44),#55);`,
    "#57=IFCMATERIAL('Concrete',$,'concrete');",
    `#58=IFCRELASSOCIATESMATERIAL('${mappedGids.materialRelation}',#5,$,$,(#40,#44),#57);`,
    "#59=IFCQUANTITYLENGTH('Length',$,$,4.,$);",
    "#60=IFCQUANTITYAREA('GrossSideArea',$,$,12.,$);",
    "#61=IFCQUANTITYVOLUME('GrossVolume',$,$,2.4,$);",
    `#62=IFCELEMENTQUANTITY('${mappedGids.elementQuantity}',#5,'Qto_WallBaseQuantities',$,'BaseQuantities',(#59,#60,#61));`,
    `#63=IFCRELDEFINESBYPROPERTIES('${mappedGids.quantityRelation}',#5,$,$,(#40,#44),#62);`,
    "#64=IFCCLASSIFICATION('BIM Explorer','2026',$,'Synthetic Classification',$,$,$);",
    "#65=IFCCLASSIFICATIONREFERENCE($,'BE-WALL','Synthetic Wall Class',#64,$,$);",
    `#66=IFCRELASSOCIATESCLASSIFICATION('${mappedGids.classificationRelation}',#5,$,$,(#40,#44),#65);`,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ];
  return lines.join("\n");
}

export const SYNTHETIC_PERFORMANCE_WALLS = 1_024;

function stepReal(value) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("synthetic STEP coordinate must be an integer");
  }
  return `${value}.`;
}

export function syntheticPerformanceIfc() {
  const lines = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    "FILE_NAME('synthetic-performance.ifc','2026-08-03T00:00:00',('BIM Explorer'),(''),'BIM Explorer fixture generator','BIM Explorer','');",
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];
  let nextEntityId = 1;
  let nextGlobalId = 1_025;
  const entity = (expression) => {
    const id = nextEntityId;
    nextEntityId += 1;
    lines.push(`#${id}=${expression};`);
    return id;
  };
  const guid = () => {
    const value = assertGlobalId(globalId(nextGlobalId));
    nextGlobalId += 1;
    return value;
  };

  const person = entity("IFCPERSON($,$,'BIM Explorer',$,$,$,$,$)");
  const organization = entity(
    "IFCORGANIZATION($,'BIM Explorer',$,$,$)",
  );
  const personAndOrganization = entity(
    `IFCPERSONANDORGANIZATION(#${person},#${organization},$)`,
  );
  const application = entity(
    `IFCAPPLICATION(#${organization},'0.0.0',` +
      "'BIM Explorer Fixture Generator','BIMEXPLORER')",
  );
  const ownerHistory = entity(
    `IFCOWNERHISTORY(#${personAndOrganization},#${application},` +
      "$,.ADDED.,$,$,$,1785715200)",
  );
  const lengthUnit = entity("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const areaUnit = entity("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const volumeUnit = entity("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const units = entity(
    `IFCUNITASSIGNMENT((#${lengthUnit},#${areaUnit},#${volumeUnit}))`,
  );
  const origin = entity("IFCCARTESIANPOINT((0.,0.,0.))");
  const worldAxis = entity(`IFCAXIS2PLACEMENT3D(#${origin},$,$)`);
  const context = entity(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,` +
      `#${worldAxis},$)`,
  );
  const project = entity(
    `IFCPROJECT('${guid()}',#${ownerHistory},` +
      "'Synthetic Performance Project',$,$,$,$," +
      `(#${context}),#${units})`,
  );
  const sitePlacement = entity(`IFCLOCALPLACEMENT($,#${worldAxis})`);
  const site = entity(
    `IFCSITE('${guid()}',#${ownerHistory},'Synthetic Site',$,$,` +
      `#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  const buildingPlacement = entity(
    `IFCLOCALPLACEMENT(#${sitePlacement},#${worldAxis})`,
  );
  const building = entity(
    `IFCBUILDING('${guid()}',#${ownerHistory},` +
      "'Synthetic Performance Building',$,$," +
      `#${buildingPlacement},$,$,.ELEMENT.,$,$,$)`,
  );
  const storeyPlacement = entity(
    `IFCLOCALPLACEMENT(#${buildingPlacement},#${worldAxis})`,
  );
  const storey = entity(
    `IFCBUILDINGSTOREY('${guid()}',#${ownerHistory},` +
      "'Performance Level',$,$," +
      `#${storeyPlacement},$,$,.ELEMENT.,0.)`,
  );
  const profileOrigin = entity("IFCCARTESIANPOINT((0.,0.))");
  const profileAxis = entity(`IFCAXIS2PLACEMENT2D(#${profileOrigin},$)`);
  const profile = entity(
    `IFCRECTANGLEPROFILEDEF(.AREA.,'PerformanceWallProfile',` +
      `#${profileAxis},4.,0.2)`,
  );
  const extrusionDirection = entity("IFCDIRECTION((0.,0.,1.))");
  const extrusion = entity(
    `IFCEXTRUDEDAREASOLID(#${profile},#${worldAxis},` +
      `#${extrusionDirection},3.)`,
  );
  const mappedRepresentation = entity(
    `IFCSHAPEREPRESENTATION(#${context},'Body','SweptSolid',` +
      `(#${extrusion}))`,
  );
  const representationMap = entity(
    `IFCREPRESENTATIONMAP(#${worldAxis},#${mappedRepresentation})`,
  );
  const mappingOrigin = entity("IFCCARTESIANPOINT((0.,0.,0.))");
  const mappingTarget = entity(
    `IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#${mappingOrigin},1.,$)`,
  );
  const wallType = entity(
    `IFCWALLTYPE('${guid()}',#${ownerHistory},` +
      "'PerformanceWallType',$,$,$," +
      `(#${representationMap}),$,$,.STANDARD.)`,
  );
  const wallIds = [];

  for (let index = 0; index < SYNTHETIC_PERFORMANCE_WALLS; index += 1) {
    const column = index % 32;
    const row = Math.floor(index / 32);
    const location = entity(
      `IFCCARTESIANPOINT((${stepReal(column * 6)},` +
        `${stepReal(row * 3)},0.))`,
    );
    const axis = entity(`IFCAXIS2PLACEMENT3D(#${location},$,$)`);
    const placement = entity(
      `IFCLOCALPLACEMENT(#${storeyPlacement},#${axis})`,
    );
    const mappedItem = entity(
      `IFCMAPPEDITEM(#${representationMap},#${mappingTarget})`,
    );
    const shape = entity(
      `IFCSHAPEREPRESENTATION(#${context},'Body',` +
        `'MappedRepresentation',(#${mappedItem}))`,
    );
    const productShape = entity(
      `IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`,
    );
    const sequence = String(index + 1).padStart(4, "0");
    wallIds.push(entity(
      `IFCWALL('${guid()}',#${ownerHistory},` +
        `'Performance Wall-${sequence}',$,$,#${placement},` +
        `#${productShape},'PW-${sequence}',.STANDARD.)`,
    ));
  }

  entity(
    `IFCRELAGGREGATES('${guid()}',#${ownerHistory},$,$,` +
      `#${project},(#${site}))`,
  );
  entity(
    `IFCRELAGGREGATES('${guid()}',#${ownerHistory},$,$,` +
      `#${site},(#${building}))`,
  );
  entity(
    `IFCRELAGGREGATES('${guid()}',#${ownerHistory},$,$,` +
      `#${building},(#${storey}))`,
  );
  const relatedWalls = wallIds.map((id) => `#${id}`).join(",");
  entity(
    `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',` +
      `#${ownerHistory},$,$,(${relatedWalls}),#${storey})`,
  );
  entity(
    `IFCRELDEFINESBYTYPE('${guid()}',#${ownerHistory},$,$,` +
      `(${relatedWalls}),#${wallType})`,
  );
  lines.push(
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  );
  return lines.join("\n");
}

function outputArguments(values) {
  if (values.length % 2 !== 0) {
    throw new TypeError(
      "usage: node scripts/generate-synthetic-ifc.mjs " +
        "[--fixture small|mapped|performance] --output <path>",
    );
  }
  const options = {
    fixture: "small",
    output: null,
  };
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      name === "--fixture" &&
      ["small", "mapped", "performance"].includes(value)
    ) {
      options.fixture = value;
    } else if (name === "--output" && value) {
      options.output = path.resolve(value);
    } else {
      throw new TypeError(`invalid generator argument ${name}`);
    }
  }
  if (options.output === null) {
    throw new TypeError("--output is required");
  }
  return options;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = outputArguments(process.argv.slice(2));
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(
    options.output,
    options.fixture === "mapped"
      ? syntheticMappedIfc()
      : options.fixture === "performance"
        ? syntheticPerformanceIfc()
        : syntheticIfc(),
    {
      encoding: "utf8",
      flag: "wx",
    },
  );
  console.log(options.output);
}
