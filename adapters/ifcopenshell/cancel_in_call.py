#!/usr/bin/env python3

import argparse
import hashlib
import json
import re

import ifcopenshell


PROGRESS_SCHEMA = "bim-explorer-ifc-in-call-progress/0.1"
FIXTURE_ID = re.compile(r"^[a-z0-9][a-z0-9-]+$")


def arguments():
    parser = argparse.ArgumentParser(
        description="Start an IfcOpenShell call for cancellation qualification",
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--fixture-id", required=True)
    options = parser.parse_args()
    if not FIXTURE_ID.fullmatch(options.fixture_id):
        parser.error("invalid fixture id")
    return options


def main():
    options = arguments()
    with open(options.input, "rb") as source_file:
        source_bytes = source_file.read()
    source = {
        "id": options.fixture_id,
        "byteLength": len(source_bytes),
        "sha256": hashlib.sha256(source_bytes).hexdigest(),
    }
    print(
        json.dumps(
            {
                "schema": PROGRESS_SCHEMA,
                "phase": "model-open-call-starting",
                "engine": {
                    "id": "ifcopenshell",
                    "version": str(ifcopenshell.__version__),
                    "backend": "python-native-process",
                },
                "source": source,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    model = ifcopenshell.open(options.input)
    print(
        json.dumps(
            {
                "schema":
                    "bim-explorer-ifc-in-call-unexpected-completion/0.1",
                "status": "completed",
                "source": {
                    **source,
                    "schema": model.schema,
                },
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
