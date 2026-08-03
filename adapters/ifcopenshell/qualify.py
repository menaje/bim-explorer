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


REPORT_SCHEMA = "bim-explorer-ifc-engine-report/0.1"
FINGERPRINT_PROJECTION = "bim-explorer-ifc-engine-fingerprint/0.1"
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
    return parser.parse_args()


def text(value):
    return value if isinstance(value, str) else ""


def first_name(model, entity_type):
    entities = model.by_type(entity_type)
    return text(entities[0].Name) if entities else ""


def capabilities():
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

    for product in model.by_type("IfcWall"):
        shape = ifcopenshell.geom.create_shape(settings, product)
        product_vertices = shape.geometry.verts
        product_faces = shape.geometry.faces
        products += 1
        geometries += 1
        vertices += len(product_vertices) // 3
        triangles += len(product_faces) // 3
        for index in range(0, len(product_vertices), 3):
            for axis in range(3):
                coordinate = product_vertices[index + axis]
                minimum[axis] = min(minimum[axis], coordinate)
                maximum[axis] = max(maximum[axis], coordinate)

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


def inspect(source):
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
            "id": "synthetic-small-ifc4",
            "schema": model.schema,
            "view": "ReferenceView_V1.2",
            "byteLength": len(source_bytes),
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
        },
        "capabilities": capabilities(),
        **semantic,
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
    report = inspect(options.input)
    print(
        json.dumps(
            report,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
