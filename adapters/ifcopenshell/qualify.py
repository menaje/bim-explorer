#!/usr/bin/env python3

import argparse
import hashlib
import json
import platform
import resource
import sys
import time
import tracemalloc

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element


REPORT_SCHEMA = "bim-explorer-ifc-engine-report/0.2"
FINGERPRINT_PROJECTION = "bim-explorer-ifc-engine-fingerprint/0.2"
CAPABILITY_NAMES = (
    "parse",
    "semanticIndex",
    "geometry",
    "placements",
    "mappedRepresentations",
    "identity",
    "typeOccurrence",
    "propertySets",
    "quantities",
    "materials",
    "classifications",
    "relations",
    "sharedGeometryInstances",
    "writeRoundTrip",
    "cancellation",
    "corruptInputCleanup",
    "packagingMacos",
    "packagingLinux",
    "packagingBrowser",
    "packagingVscode",
)
ENTITY_TYPES = (
    "IfcProject",
    "IfcSite",
    "IfcBuilding",
    "IfcBuildingStorey",
    "IfcSpace",
    "IfcWall",
    "IfcWallType",
    "IfcPropertySet",
    "IfcElementQuantity",
    "IfcMaterial",
    "IfcClassification",
    "IfcClassificationReference",
    "IfcRepresentationMap",
    "IfcMappedItem",
)
RELATION_TYPES = (
    "IfcRelAggregates",
    "IfcRelContainedInSpatialStructure",
    "IfcRelDefinesByType",
    "IfcRelDefinesByProperties",
    "IfcRelAssociatesMaterial",
    "IfcRelAssociatesClassification",
)


def arguments():
    parser = argparse.ArgumentParser(
        description="Inspect one IFC source in an isolated IfcOpenShell process",
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--fixture-id", required=True)
    return parser.parse_args()


def text(value):
    return value if isinstance(value, str) else ""


def first_name(model, entity_type):
    entities = model.by_type(entity_type)
    return text(entities[0].Name) if entities else ""


def express_id_diagnostics(roots):
    express_ids = [entity.id() for entity in roots]
    pairs = sorted(
        [
            [text(getattr(entity, "GlobalId", None)), entity.id()]
            for entity in roots
        ],
        key=lambda pair: (pair[0], pair[1]),
    )
    mapping_payload = json.dumps(
        pairs,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "count": len(express_ids),
        "duplicates": len(express_ids) - len(set(express_ids)),
        "minimum": min(express_ids),
        "maximum": max(express_ids),
        "globalIdMapSha256": hashlib.sha256(mapping_payload).hexdigest(),
    }


def wall_quantities(wall):
    quantity_sets = ifcopenshell.util.element.get_psets(
        wall,
        qtos_only=True,
        should_inherit=True,
    )
    quantities = {}
    for quantity_set in quantity_sets.values():
        for name, value in quantity_set.items():
            if (
                name != "id"
                and isinstance(value, (int, float))
                and not isinstance(value, bool)
            ):
                quantities[name] = stable_coordinate(float(value))
    return dict(sorted(quantities.items()))


def wall_classifications(wall):
    values = []
    for association in wall.HasAssociations or ():
        if not association.is_a("IfcRelAssociatesClassification"):
            continue
        reference = association.RelatingClassification
        source = getattr(reference, "ReferencedSource", None)
        values.append(
            {
                "identification": text(
                    getattr(reference, "Identification", None)
                ),
                "name": text(getattr(reference, "Name", None)),
                "source": text(getattr(source, "Name", None)),
            }
        )
    return sorted(
        [
            value
            for value in values
            if all(value.values())
        ],
        key=lambda value: value["identification"],
    )


def representation_sharing(model):
    maps = model.by_type("IfcRepresentationMap")
    mapped_items = model.by_type("IfcMappedItem")
    mapping_sources = {
        item.MappingSource.id()
        for item in mapped_items
    }
    products_using_mapped_items = 0
    for wall in model.by_type("IfcWall"):
        representation = wall.Representation
        if representation and any(
            item.is_a("IfcMappedItem")
            for shape in representation.Representations
            for item in shape.Items
        ):
            products_using_mapped_items += 1
    return {
        "representationMaps": len(maps),
        "mappedItems": len(mapped_items),
        "productsUsingMappedItems": products_using_mapped_items,
        "distinctMappingSources": len(mapping_sources),
    }


def capabilities(semantic_result, sharing):
    result = {name: "blocked" for name in CAPABILITY_NAMES}
    result.update(
        {
            "parse": "native",
            "semanticIndex": "native",
            "geometry": "native",
            "placements": "mapped",
            "identity": "native",
            "typeOccurrence": "mapped",
            "propertySets": "mapped",
            "materials": "mapped",
            "relations": "native",
            "packagingMacos": (
                "native" if sys.platform == "darwin" else "blocked"
            ),
            "packagingLinux": (
                "native" if sys.platform.startswith("linux") else "blocked"
            ),
        }
    )
    wall = semantic_result["semantics"]["wall"]
    if wall["quantities"]:
        result["quantities"] = "mapped"
    if wall["classifications"]:
        result["classifications"] = "mapped"
    if (
        sharing["representationMaps"] > 0
        and sharing["mappedItems"] > 0
        and sharing["productsUsingMappedItems"] > 0
    ):
        result["mappedRepresentations"] = "mapped"
    if (
        sharing["mappedItems"] > sharing["distinctMappingSources"]
        and sharing["productsUsingMappedItems"] > 1
    ):
        result["sharedGeometryInstances"] = "mapped"
    return result


def semantics(model):
    roots = model.by_type("IfcRoot")
    global_ids = [text(getattr(entity, "GlobalId", None)) for entity in roots]
    present_ids = [value for value in global_ids if value]
    wall = model.by_type("IfcWall")[0]
    wall_type = ifcopenshell.util.element.get_type(wall)
    materials = ifcopenshell.util.element.get_materials(
        wall,
        should_inherit=True,
    )
    property_sets = ifcopenshell.util.element.get_psets(
        wall,
        psets_only=True,
        should_inherit=True,
    )
    return {
        "semantics": {
            "entityCounts": {
                entity_type: len(model.by_type(entity_type))
                for entity_type in ENTITY_TYPES
            },
            "globalIds": {
                "count": len(present_ids),
                "duplicates": len(present_ids) - len(set(present_ids)),
                "missingOnIfcRoot": len(global_ids) - len(present_ids),
            },
            "expressIds": express_id_diagnostics(roots),
            "spatialHierarchy": [
                first_name(model, "IfcProject"),
                first_name(model, "IfcSite"),
                first_name(model, "IfcBuilding"),
                first_name(model, "IfcBuildingStorey"),
            ],
            "wall": {
                "name": text(wall.Name),
                "tag": text(wall.Tag),
                "type": text(wall_type.Name) if wall_type else "",
                "materials": sorted(
                    {
                        text(getattr(material, "Name", None))
                        for material in materials
                        if text(getattr(material, "Name", None))
                    }
                ),
                "propertySets": sorted(property_sets.keys()),
                "quantities": wall_quantities(wall),
                "classifications": wall_classifications(wall),
            },
        },
        "relations": {
            relation_type: len(model.by_type(relation_type))
            for relation_type in RELATION_TYPES
        },
    }


def stable_coordinate(value):
    rounded = round(value, 6)
    return int(rounded) if rounded.is_integer() else rounded


def geometry(model):
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    products = 0
    geometries = 0
    vertices = 0
    triangles = 0
    minimum = [float("inf"), float("inf"), float("inf")]
    maximum = [float("-inf"), float("-inf"), float("-inf")]
    instances = []

    for product in model.by_type("IfcWall"):
        shape = ifcopenshell.geom.create_shape(settings, product)
        product_vertices = shape.geometry.verts
        product_faces = shape.geometry.faces
        products += 1
        geometries += 1
        vertices += len(product_vertices) // 3
        product_triangles = len(product_faces) // 3
        triangles += product_triangles
        instance_minimum = [
            min(product_vertices[axis::3])
            for axis in range(3)
        ]
        instance_maximum = [
            max(product_vertices[axis::3])
            for axis in range(3)
        ]
        for index in range(0, len(product_vertices), 3):
            for axis in range(3):
                coordinate = product_vertices[index + axis]
                minimum[axis] = min(minimum[axis], coordinate)
                maximum[axis] = max(maximum[axis], coordinate)
        instances.append(
            {
                "globalId": text(product.GlobalId),
                "expressId": product.id(),
                "triangles": product_triangles,
                "bounds": {
                    "min": [
                        stable_coordinate(value)
                        for value in instance_minimum
                    ],
                    "max": [
                        stable_coordinate(value)
                        for value in instance_maximum
                    ],
                },
            }
        )

    if geometries == 0:
        raise RuntimeError("fixture produced no wall geometry")

    return {
        "products": products,
        "geometries": geometries,
        "vertices": vertices,
        "triangles": triangles,
        "coordinateSystem": "ifc-world-z-up",
        "bounds": {
            "min": [stable_coordinate(value) for value in minimum],
            "max": [stable_coordinate(value) for value in maximum],
        },
        "instances": sorted(
            instances,
            key=lambda instance: instance["expressId"],
        ),
    }


def max_rss_bytes():
    maximum = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if platform.system() == "Darwin":
        return int(maximum)
    return int(maximum * 1024)


def fingerprint_projection(report):
    return {
        "projection": FINGERPRINT_PROJECTION,
        "engine": {
            "id": report["engine"]["id"],
            "version": report["engine"]["version"],
            "backend": report["engine"]["backend"],
        },
        "fixture": report["fixture"],
        "capabilities": report["capabilities"],
        "semantics": report["semantics"],
        "relations": report["relations"],
        "representationSharing": report["representationSharing"],
        "geometry": report["geometry"],
    }


def fingerprint(report):
    payload = json.dumps(
        fingerprint_projection(report),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def inspect(source, fixture_id):
    total_started = time.perf_counter()
    tracemalloc.start()
    with open(source, "rb") as input_file:
        source_bytes = input_file.read()

    initialization_started = time.perf_counter()
    engine_version = str(
        getattr(
            ifcopenshell,
            "__version__",
            getattr(ifcopenshell, "version", "unknown"),
        )
    )
    initialization_ms = (
        time.perf_counter() - initialization_started
    ) * 1000

    open_started = time.perf_counter()
    model = ifcopenshell.open(source)
    open_ms = (time.perf_counter() - open_started) * 1000

    semantic_started = time.perf_counter()
    semantic = semantics(model)
    sharing = representation_sharing(model)
    semantic_ms = (time.perf_counter() - semantic_started) * 1000

    geometry_started = time.perf_counter()
    geometry_result = geometry(model)
    geometry_ms = (time.perf_counter() - geometry_started) * 1000
    heap_used_bytes = tracemalloc.get_traced_memory()[0]

    report = {
        "schema": REPORT_SCHEMA,
        "engine": {
            "id": "ifcopenshell",
            "version": engine_version,
            "backend": "python-native-process",
            "license": "LGPL-3.0-or-later",
        },
        "fixture": {
            "id": fixture_id,
            "schema": model.schema,
            "view": "ReferenceView_V1.2",
            "byteLength": len(source_bytes),
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
        },
        "capabilities": capabilities(semantic, sharing),
        **semantic,
        "representationSharing": sharing,
        "geometry": geometry_result,
        "performance": {
            "initializationMs": initialization_ms,
            "openMs": open_ms,
            "semanticMs": semantic_ms,
            "geometryMs": geometry_ms,
            "totalMs": (time.perf_counter() - total_started) * 1000,
            "peakRssBytes": max_rss_bytes(),
            "heapUsedBytes": heap_used_bytes,
        },
        "cleanup": {
            "modelClosed": False,
            "engineDisposed": False,
        },
        "diagnostics": ["cleanup-isolated-to-process-exit"],
    }
    report["fingerprint"] = {
        "algorithm": "sha256",
        "projection": FINGERPRINT_PROJECTION,
        "value": fingerprint(report),
    }
    tracemalloc.stop()
    return report


def main():
    options = arguments()
    report = inspect(options.input, options.fixture_id)
    print(
        json.dumps(
            report,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
