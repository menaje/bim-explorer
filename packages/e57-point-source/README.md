# `@bim-explorer/e57-point-source`

Experimental, read-only E57 1.0 point-source projection for BIM Explorer.
The bounded profile accepts one `data3D` scan with the default empty codec
vector and either Cartesian XYZ or spherical range/azimuth/elevation records.
Coordinate fields may be Float32, Float64, Integer or ScaledInteger within the
53-bit integer bound. All three RGB records may be present or absent, and an
optional intensity record is decoded for stream alignment but is not projected.
The matching `cartesianInvalidState` or `sphericalInvalidState` field filters
direction and invalid records before bounds and point-range projection.
Compressed-vector indexes may be present or omitted. The decoder verifies every
physical page CRC-32C, the XML envelope, compressed-vector section, packet
bounds and bounded zero terminal padding before deriving one source-neutral `BEXPTS01`
Float64-origin/relative-Float32/RGBA8 point range.

A bounded multiple-scan product decoder accepts two to eight scans within a
32 MiB source, 2,000,000 aggregate-record, 750,000 per-scan and 64 MiB decoded
storage envelope. It preserves scan GUID/name identity, decodes structured
row/column streams for packet alignment, and applies explicit unit-quaternion
rotation plus translation. A missing pose is treated as an explicit limitation
and projected through the identity transform. It aggregates posed records into
one source-neutral point range bounded to 32 MiB.

The decoder is product-owned JavaScript and runs inside the isolated point
Worker without WASM, dynamic code or network access. Its packet and BitPack
behavior was implemented with the MIT-licensed `cry-inc/e57@0.10.5` source as
an audit reference; the exact source identity and notice are recorded in the
repository third-party notices.

The source has no BIM semantic authority, native write or round-trip
authority. Coordinates remain `unqualified`: local scan-pose application does
not infer a CRS, datum, surveyed control or accuracy. Spherical input is
converted to Cartesian display coordinates. Extension records, images,
source-declared point identity and LOD streaming remain outside the product
profile. The product renderer may derive and pick `point:n` from the exact
projected range order within one source revision and range digest. This does not
preserve the original index of filtered invalid records or create E57 semantic
authority. Omitting intensity from the display range
is reported as lossy and does not create intensity semantic authority.

Default bounds are 8 MiB source bytes, 500,000 records, 16 MiB decoded point
storage and one 8 MiB derived point range. The explicitly selected multiple-scan
profile raises those bounds only to 32 MiB source, 2,000,000 records, 64 MiB
decoded storage and one 32 MiB range. Callers own and must clear source and
returned range buffers after transfer or renderer upload.

The pinned cache-only colored-cube reference sample has passed actual Browser
local-file, staged VS Code Custom Editor and clean-installed VSIX product-open
qualification. Two additional cache-only bunny samples qualify Float64 and
ScaledInteger XYZ, optional Cartesian validity and an indexless
compressed-vector section against an independent `pye57/libE57Format`
position digest. Those samples are not redistributed and the reference decoder
is not a product dependency. A 5,168,128-byte SourceForge E57 example additionally
qualifies 370,530 spherical records, 215,329 invalid-record removals and 155,201
Cartesian display points against `pye57/libE57Format` nanometer-quantized parity.
The same 2,483,216-byte point payload passes actual Browser, staged VS Code and
clean-installed VSIX product-open qualification. The sample remains in the
ignored cache and is not redistributed. The evidence admits only this bounded
experimental product profile; it does not admit the E57 format family or the
source as a federation coordinate authority.

The 22,146,048-byte `pumpNoInvalidPoints.e57` SourceForge example is also used
from the ignored digest cache without redistribution. Its five scans contain
1,213,990 Cartesian/intensity/RGB/row/column records, four explicit poses and
one omitted identity pose. Pose-applied nanometer position and RGB SHA-256
digests match the independently pinned `pye57@0.4.18/libE57Format` reference.
The same 19,423,840-byte payload passes actual Browser local-file, staged
VS Code and clean-installed VSIX product-open qualification with exact visible
projection and cleanup. This bounded evidence remains pre-admission and does
not qualify CRS, surveyed datum, extension behavior or the E57 format family.
