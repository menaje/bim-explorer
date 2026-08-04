#!/usr/bin/env python3

import argparse
import gc
import hashlib
import json
import re

import ifcopenshell


RESULT_SCHEMA = "bim-explorer-ifc-negative-result/0.1"
FIXTURE_ID = re.compile(r"^[a-z0-9][a-z0-9-]+$")


class UnexpectedAcceptance(Exception):
    pass


def arguments():
    parser = argparse.ArgumentParser(
        description="Reject one negative IFC source in an isolated process",
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--fixture-id", required=True)
    options = parser.parse_args()
    if not FIXTURE_ID.fullmatch(options.fixture_id):
        parser.error("invalid fixture id")
    return options


def engine_version():
    return str(
        getattr(
            ifcopenshell,
            "__version__",
            getattr(ifcopenshell, "version", "unknown"),
        )
    )


def inspect_negative(source, fixture_id):
    with open(source, "rb") as source_file:
        source_bytes = source_file.read()

    model = None
    model_opened = False
    model_reference_released = False
    failure_phase = "model-open"
    rejected = False
    try:
        model = ifcopenshell.open(source)
        model_opened = True
        failure_phase = "semantic-admission"
        if (
            len(model.by_type("IfcProject")) > 0
            and len(model.by_type("IfcWall")) > 0
        ):
            raise UnexpectedAcceptance()
        raise ValueError("required exploration entities are missing")
    except UnexpectedAcceptance:
        raise
    except Exception:
        rejected = True
    finally:
        if model is not None:
            del model
            gc.collect()
            model_reference_released = True

    if not rejected:
        raise UnexpectedAcceptance()

    return {
        "schema": RESULT_SCHEMA,
        "status": "rejected",
        "engine": {
            "id": "ifcopenshell",
            "version": engine_version(),
            "backend": "python-native-process",
            "license": "LGPL-3.0-or-later",
        },
        "fixture": {
            "id": fixture_id,
            "byteLength": len(source_bytes),
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
        },
        "failure": {
            "code": "IFC_INPUT_REJECTED",
            "phase": failure_phase,
        },
        "cleanup": {
            "strategy": "process-isolation",
            "engineInitialized": True,
            "modelOpened": model_opened,
            "modelClosed": False,
            "modelReferenceReleased": model_reference_released,
            "engineDisposed": False,
            "processExitRequired": True,
        },
        "diagnostics": [
            {
                "code": "IFC_INPUT_REJECTED",
            }
        ],
    }


def main():
    options = arguments()
    report = inspect_negative(options.input, options.fixture_id)
    print(
        json.dumps(
            report,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
